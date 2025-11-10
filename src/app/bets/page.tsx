'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Container,
  Paper,
  InputAdornment,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EventIcon from '@mui/icons-material/Event';
import TitleIcon from '@mui/icons-material/Title';
import BetCard from '@/components/BetCard';
import { useToast } from '@/components/ToastProvider';

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
  const [formData, setFormData] = useState({
    eventName: '',
    startTime: '',
    odds: '',
    units: '',
  });
  const [submitting, setSubmitting] = useState(false);

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

  const handleCreate = async () => {
    if (!formData.eventName || !formData.startTime || !formData.odds || !formData.units) {
      toast.showWarning('Please fill in all fields');
      return;
    }

    // Validate start time is in the future
    const startTime = new Date(formData.startTime);
    if (startTime <= new Date()) {
      toast.showError('Start time must be in the future');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName: formData.eventName.trim(),
          startTime: startTime.toISOString(),
          odds: parseFloat(formData.odds),
          units: parseFloat(formData.units),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to create bet' }));
        toast.showError(error.error || 'Failed to create bet');
        return;
      }

      setCreateOpen(false);
      setFormData({ eventName: '', startTime: '', odds: '', units: '' });
      toast.showSuccess('Bet created successfully!');
      fetchBets();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create bet';
      toast.showError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate preview values
  const odds = parseFloat(formData.odds) || 0;
  const units = parseFloat(formData.units) || 0;
  const potentialWin = odds > 0 && units > 0 ? units * (odds - 1) : 0;
  const totalReturn = odds > 0 && units > 0 ? units * odds : 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
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
          sx={{ px: 3, py: 1.5 }}
        >
          Create Bet
        </Button>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
          <CircularProgress />
        </Box>
      ) : bets.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
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
          >
            Create Your First Bet
          </Button>
        </Paper>
      ) : (
        <Box>
          {bets.map((bet) => (
            <BetCard
              key={bet._id}
              bet={bet}
              onUpdate={fetchBets}
            />
          ))}
        </Box>
      )}

      {/* Enhanced Create Bet Dialog */}
      <Dialog 
        open={createOpen} 
        onClose={() => setCreateOpen(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 }
        }}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <AddIcon color="primary" />
            <Typography variant="h6" fontWeight={600}>
              Create New Bet
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ width: '100%' }}>
              <TextField
                fullWidth
                label="Event Name"
                value={formData.eventName}
                onChange={(e) => setFormData({ ...formData, eventName: e.target.value })}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <TitleIcon color="action" />
                    </InputAdornment>
                  ),
                }}
                helperText="Enter the name of the event or game"
              />
            </Box>
            <Box sx={{ width: '100%' }}>
              <TextField
                fullWidth
                label="Start Time"
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                InputLabelProps={{ shrink: true }}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EventIcon color="action" />
                    </InputAdornment>
                  ),
                }}
                helperText="Once the event starts, this bet will be locked and cannot be edited"
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
              <Box sx={{ width: { xs: '100%', sm: '50%' } }}>
                <TextField
                  fullWidth
                  label="Odds"
                  type="number"
                  value={formData.odds}
                  onChange={(e) => setFormData({ ...formData, odds: e.target.value })}
                  inputProps={{ min: 1.01, step: 0.01 }}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <TrendingUpIcon color="action" />
                      </InputAdornment>
                    ),
                  }}
                  helperText="Minimum: 1.01 (American odds format)"
                />
              </Box>
              <Box sx={{ width: { xs: '100%', sm: '50%' } }}>
                <TextField
                  fullWidth
                  label="Units"
                  type="number"
                  value={formData.units}
                  onChange={(e) => setFormData({ ...formData, units: e.target.value })}
                  inputProps={{ min: 0.01, step: 0.01 }}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AttachMoneyIcon color="action" />
                      </InputAdornment>
                    ),
                  }}
                  helperText="Minimum: 0.01 units"
                />
              </Box>
            </Box>
            
            {(odds > 0 && units > 0) && (
              <>
                <Box sx={{ width: '100%' }}>
                  <Divider />
                </Box>
                <Box sx={{ width: '100%' }}>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Bet Preview
                    </Typography>
                    <Box display="flex" justifyContent="space-between" mb={0.5}>
                      <Typography variant="body2">Potential Win:</Typography>
                      <Typography variant="body2" fontWeight={600} color="success.main">
                        +{potentialWin.toFixed(2)} units
                      </Typography>
                    </Box>
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="body2">Total Return:</Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {totalReturn.toFixed(2)} units
                      </Typography>
                    </Box>
                  </Alert>
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 2 }}>
          <Button onClick={() => setCreateOpen(false)} size="large">
            Cancel
          </Button>
          <Button 
            onClick={handleCreate} 
            variant="contained" 
            disabled={submitting || !formData.eventName || !formData.startTime || !formData.odds || !formData.units}
            size="large"
            startIcon={submitting ? <CircularProgress size={20} /> : <AddIcon />}
          >
            {submitting ? 'Creating...' : 'Create Bet'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

