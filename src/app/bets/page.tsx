'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Container,
  Paper,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BetCard from '@/components/BetCard';
import CreateBetForm from '@/components/CreateBetForm';
import { useToast } from '@/components/ToastProvider';
import { motion, AnimatePresence } from 'framer-motion';

interface Bet {
  _id: string;
  eventName: string;
  startTime: string;
  odds: number;
  units: number;
  result: 'pending' | 'win' | 'loss' | 'push' | 'void';
  locked: boolean;
  createdAt: string;
}

export default function BetsPage() {
  const toast = useToast();
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    fetchBets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBets = async () => {
    try {
      const response = await fetch('/api/bets');
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to fetch bets' }));
        throw new Error(error.error || 'Failed to fetch bets');
      }
      const data = await response.json();
      setBets(data.bets || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch bets';
      toast.showError(message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4} flexWrap="wrap" gap={2}>
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
            onClick={() => setCreateOpen(true)}
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
              onClick={() => setCreateOpen(true)}
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
          </Box>
        </AnimatePresence>
      )}

      {/* Enhanced Create Bet Form */}
      <CreateBetForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={fetchBets}
      />
    </Container>
  );
}

