'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Container,
  Paper,
  CircularProgress,
  TextField,
  InputAdornment,
  IconButton,
  FormControl,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BetCard from '@/components/BetCard';
import CreateBetForm from '@/components/CreateBetForm';
import { useToast } from '@/components/ToastProvider';
import { motion, AnimatePresence } from 'framer-motion';
import SearchIcon from '@mui/icons-material/Search';
import { useAccess } from '@/components/AccessProvider';

interface Bet {
  _id: string;
  eventName: string;
  startTime: string;
  odds: number;
  oddsAmerican: number;
  units: number;
  result: 'pending' | 'win' | 'loss' | 'push' | 'void';
  locked: boolean;
  createdAt: string;
  marketType: 'ML' | 'Spread' | 'Total' | 'Player Prop' | 'Parlay';
  parlaySummary?: string;
  parlayLegs?: Array<{
    _id: string;
    eventName: string;
    startTime: string;
    oddsAmerican: number;
    marketType: 'ML' | 'Spread' | 'Total' | 'Player Prop';
    selection?: string;
    line?: number;
    overUnder?: 'Over' | 'Under';
    playerName?: string;
    statType?: string;
    odds: number;
    units: number;
    result: 'pending' | 'win' | 'loss' | 'push' | 'void';
  }>;
}

export default function BetsPage() {
  const toast = useToast();
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [hasCompanyId, setHasCompanyId] = useState<boolean | null>(null);
  const { isAuthorized, loading: accessLoading } = useAccess();

  // Pagination & search
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isAuthorized) return;
    fetchBets();
    fetchUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, isAuthorized]);

  // Refresh companyId check when window regains focus (user might have updated profile in another tab)
  useEffect(() => {
    const handleFocus = () => {
      if (isAuthorized) {
        fetchUserProfile();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isAuthorized]);

  const fetchUserProfile = async () => {
    if (!isAuthorized) return;
    try {
      const response = await fetch('/api/user');
      if (response.ok) {
        const data = await response.json();
        setHasCompanyId(!!data.user?.companyId);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  // Debounced search-as-you-type
  useEffect(() => {
    if (!isAuthorized) return;
    const handle = setTimeout(() => {
      setPage(1);
      fetchBets();
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, isAuthorized]);
  useEffect(() => {
    if (!isAuthorized) return;
    const fetchSettle = async () => {
      try {
        const response = await fetch('/api/bets/settle-all', {
          method: 'POST',
        });
        if (!response.ok) throw new Error('Failed to settle bets');
        const data = await response.json();
        console.log(data);
      } catch (error) {
        console.error('Error settling bets:', error);
      }
    };
    fetchSettle();
    fetchBets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized]);

  const fetchBets = async () => {
    if (!isAuthorized) {
      setBets([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/bets?${params.toString()}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to fetch bets' }));
        throw new Error(error.error || 'Failed to fetch bets');
      }
      const data = await response.json();
      setBets(data.bets || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch bets';
      toast.showError(message);
    } finally {
      setLoading(false);
    }
  };


  if (accessLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight={400} gap={3}>
          <CircularProgress 
            size={60}
            thickness={4}
            sx={{ 
              color: '#6366f1',
              filter: 'drop-shadow(0 0 10px rgba(99, 102, 241, 0.5))',
            }} 
          />
          <Typography variant="h6" sx={{ color: '#a1a1aa', fontWeight: 500 }}>
            Checking access...
          </Typography>
        </Box>
      </Container>
    );
  }

  if (!isAuthorized) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
            Access Restricted
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Only administrators and owners can manage bets.
          </Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={2}>
          <Box>
            <Typography 
              variant="h4" 
              component="h1" 
              fontWeight={700} 
              gutterBottom
              sx={{
                background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              My Bets
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Track and manage your betting activity
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="large"
            startIcon={<AddIcon />}
            onClick={() => {
              if (hasCompanyId === false) {
                setWarningOpen(true);
              } else {
                setCreateOpen(true);
              }
            }}
            sx={{ 
              px: 3, 
              py: 1.5,
              background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
              boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #4f46e5 0%, #db2777 100%)',
                boxShadow: '0 12px 40px rgba(99, 102, 241, 0.4)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.3s ease',
            }}
          >
            Create Bet
          </Button>
        </Box>

        {/* Search & Pagination controls */}
        <Box display="flex" gap={2} flexWrap="wrap" mb={3}>
          <Paper sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(17, 24, 39, 0.6)', backdropFilter: 'blur(6px)' }}>
            <TextField
              variant="outlined"
              size="small"
              placeholder="Search bets (team, sport, league, market, notes)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchBets(); } }}
              sx={{
                minWidth: 320,
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                  '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.5)' },
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#a1a1aa' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => { setPage(1); fetchBets(); }}>
                      <SearchIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Paper>

          <Paper sx={{ p: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', bgcolor: 'rgba(17, 24, 39, 0.6)', backdropFilter: 'blur(6px)' }}>
            <Typography variant="body2" color="text.secondary">Page size</Typography>
            <FormControl size="small">
              <Select
                value={pageSize}
                onChange={(e) => { setPageSize(e.target.value as number); setPage(1); }}
                sx={{
                  minWidth: 80,
                  color: '#fff',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                }}
              >
                {[10, 20, 50].map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Paper>
        </Box>
      </motion.div>

      {loading ? (
        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" minHeight={400} gap={3}>
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <CircularProgress 
              size={60}
              thickness={4}
              sx={{ 
                color: '#6366f1',
                filter: 'drop-shadow(0 0 10px rgba(99, 102, 241, 0.5))',
              }} 
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Typography 
              variant="h6" 
              sx={{ 
                color: '#a1a1aa',
                fontWeight: 500,
                background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Loading your bets...
            </Typography>
          </motion.div>
        </Box>
      ) : bets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No bets yet
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Create your first bet to start tracking your performance
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                if (hasCompanyId === false) {
                  setWarningOpen(true);
                } else {
                  setCreateOpen(true);
                }
              }}
              sx={{
                background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
                boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #4f46e5 0%, #db2777 100%)',
                  boxShadow: '0 12px 40px rgba(99, 102, 241, 0.4)',
                  transform: 'translateY(-2px)',
                },
                transition: 'all 0.3s ease',
              }}
            >
              Create Your First Bet
            </Button>
          </Paper>
        </motion.div>
      ) : (
        <AnimatePresence>
          <Box>
            {bets.map((bet, index) => (
              <motion.div
                key={bet._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Box sx={{ mb: 3 }}>
                  <BetCard
                    bet={bet}
                    onUpdate={fetchBets}
                  />
                </Box>
              </motion.div>
            ))}
            <Box display="flex" justifyContent="center" mt={3} gap={2} alignItems="center">
              <Button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
              <Typography variant="body2" color="text.secondary">Page {page} / {totalPages}</Typography>
              <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </Box>
          </Box>
        </AnimatePresence>
      )}

      {/* Enhanced Create Bet Form */}
      <CreateBetForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { setPage(1); fetchBets(); }}
      />

      {/* Warning Dialog for Missing Company ID */}
      <Dialog
        open={warningOpen}
        onClose={() => setWarningOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.95), rgba(30, 30, 60, 0.9))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 3,
          },
        }}
      >
        <DialogTitle sx={{ color: '#ffffff', fontWeight: 600 }}>
          Company ID Required
        </DialogTitle>
        <DialogContent>
          <Alert 
            severity="warning" 
            sx={{ 
              mb: 2,
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              '& .MuiAlert-icon': {
                color: '#ef4444',
              },
            }}
          >
            You need to set up your Company ID before creating bets.
          </Alert>
          <DialogContentText sx={{ color: '#a1a1aa', mb: 2 }}>
            To create bets and participate in the leaderboard, you must first set your Company ID in your profile settings.
          </DialogContentText>
          <DialogContentText sx={{ color: '#a1a1aa' }}>
            Please go to your Profile page and enter your Company ID, then try creating a bet again.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => setWarningOpen(false)}
            sx={{
              color: '#a1a1aa',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
              },
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setWarningOpen(false);
              window.location.href = '/profile';
            }}
            sx={{
              background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
              color: '#ffffff',
              '&:hover': {
                background: 'linear-gradient(135deg, #4f46e5 0%, #db2777 100%)',
              },
            }}
          >
            Go to Profile
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

