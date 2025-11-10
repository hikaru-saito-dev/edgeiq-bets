'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LockIcon from '@mui/icons-material/Lock';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import EventIcon from '@mui/icons-material/Event';
import CalculateIcon from '@mui/icons-material/Calculate';
import { useToast } from './ToastProvider';

interface BetCardProps {
  bet: {
    _id: string;
    eventName: string;
    startTime: string;
    odds: number;
    units: number;
    result: 'pending' | 'win' | 'loss' | 'push' | 'void';
    locked: boolean;
    createdAt: string;
  };
  onUpdate?: () => void;
}

export default function BetCard({ bet, onUpdate }: BetCardProps) {
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    eventName: bet.eventName,
    startTime: new Date(bet.startTime).toISOString().slice(0, 16),
    odds: bet.odds,
    units: bet.units,
  });
  const [settleResult, setSettleResult] = useState<'win' | 'loss' | 'push' | 'void'>('win');

  const getResultColor = () => {
    switch (bet.result) {
      case 'win': return 'success';
      case 'loss': return 'error';
      case 'push': return 'warning';
      case 'void': return 'default';
      default: return 'info';
    }
  };

  const getResultIcon = () => {
    switch (bet.result) {
      case 'win': return <CheckCircleIcon />;
      case 'loss': return <CancelIcon />;
      default: return <AccessTimeIcon />;
    }
  };

  const handleEdit = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/bets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betId: bet._id,
          ...formData,
          startTime: new Date(formData.startTime).toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to update bet' }));
        toast.showError(error.error || 'Failed to update bet');
        return;
      }

      setEditOpen(false);
      toast.showSuccess('Bet updated successfully!');
      onUpdate?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update bet';
      toast.showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSettle = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/bets?action=settle', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          betId: bet._id,
          result: settleResult,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to settle bet' }));
        toast.showError(error.error || 'Failed to settle bet');
        return;
      }

      setSettleOpen(false);
      toast.showSuccess(`Bet marked as ${settleResult}!`);
      onUpdate?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to settle bet';
      toast.showError(message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate potential payout using utility function
  const potentialPayout = Math.round(bet.units * (bet.odds - 1) * 100) / 100;
  const totalReturn = Math.round(bet.units * bet.odds * 100) / 100;

  return (
    <>
      <Card 
        sx={{ 
          mb: 2,
          border: bet.locked ? '2px solid' : '1px solid',
          borderColor: bet.locked ? 'warning.main' : 'divider',
          transition: 'all 0.2s ease-in-out',
          '&:hover': {
            boxShadow: 4,
            transform: 'translateY(-2px)',
          }
        }}
      >
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
            <Box flex={1}>
              <Typography variant="h6" component="div" fontWeight={600} mb={0.5}>
                {bet.eventName}
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <EventIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {new Date(bet.startTime).toLocaleString()}
                </Typography>
              </Box>
            </Box>
            <Chip
              label={bet.result.toUpperCase()}
              color={getResultColor()}
              size="medium"
              icon={getResultIcon()}
              sx={{ fontWeight: 600 }}
            />
          </Box>

          {bet.locked && (
            <Box 
              display="flex" 
              alignItems="center" 
              gap={0.5} 
              mb={2}
              sx={{ 
                p: 1, 
                bgcolor: 'warning.light', 
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'warning.main'
              }}
            >
              <LockIcon fontSize="small" color="warning" />
              <Typography variant="caption" color="warning.dark" fontWeight={600}>
                Locked - Event has started. No edits allowed.
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Box 
              sx={{ 
                p: 1.5, 
                bgcolor: 'primary.light', 
                borderRadius: 2,
                textAlign: 'center',
                width: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' }
              }}
            >
              <TrendingUpIcon fontSize="small" color="primary" sx={{ mb: 0.5 }} />
              <Typography variant="caption" display="block" color="text.secondary" fontWeight={600}>
                Odds
              </Typography>
              <Typography variant="h6" fontWeight={700} color="primary.dark">
                {bet.odds.toFixed(2)}
              </Typography>
            </Box>
            <Box 
              sx={{ 
                p: 1.5, 
                bgcolor: 'success.light', 
                borderRadius: 2,
                textAlign: 'center',
                width: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' }
              }}
            >
              <AttachMoneyIcon fontSize="small" color="success" sx={{ mb: 0.5 }} />
              <Typography variant="caption" display="block" color="text.secondary" fontWeight={600}>
                Units
              </Typography>
              <Typography variant="h6" fontWeight={700} color="success.dark">
                {bet.units.toFixed(2)}
              </Typography>
            </Box>
            <Box 
              sx={{ 
                p: 1.5, 
                bgcolor: 'info.light', 
                borderRadius: 2,
                textAlign: 'center',
                width: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' }
              }}
            >
              <CalculateIcon fontSize="small" color="info" sx={{ mb: 0.5 }} />
              <Typography variant="caption" display="block" color="text.secondary" fontWeight={600}>
                Potential Win
              </Typography>
              <Typography variant="h6" fontWeight={700} color="info.dark">
                +{potentialPayout.toFixed(2)}
              </Typography>
            </Box>
            <Box 
              sx={{ 
                p: 1.5, 
                bgcolor: 'secondary.light', 
                borderRadius: 2,
                textAlign: 'center',
                width: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' }
              }}
            >
              <AttachMoneyIcon fontSize="small" color="secondary" sx={{ mb: 0.5 }} />
              <Typography variant="caption" display="block" color="text.secondary" fontWeight={600}>
                Total Return
              </Typography>
              <Typography variant="h6" fontWeight={700} color="secondary.dark">
                {totalReturn.toFixed(2)}
              </Typography>
            </Box>
          </Box>

          <Box display="flex" gap={1} justifyContent="flex-end">
            {!bet.locked && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<EditIcon />}
                onClick={() => setEditOpen(true)}
                color="primary"
              >
                Edit
              </Button>
            )}
            {bet.result === 'pending' && (
              <Button
                variant="contained"
                size="small"
                onClick={() => setSettleOpen(true)}
                color="primary"
              >
                Settle Bet
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Bet</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Event Name"
            value={formData.eventName}
            onChange={(e) => setFormData({ ...formData, eventName: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Start Time"
            type="datetime-local"
            value={formData.startTime}
            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
            margin="normal"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            label="Odds"
            type="number"
            value={formData.odds}
            onChange={(e) => setFormData({ ...formData, odds: parseFloat(e.target.value) })}
            margin="normal"
            inputProps={{ min: 1.01, step: 0.01 }}
          />
          <TextField
            fullWidth
            label="Units"
            type="number"
            value={formData.units}
            onChange={(e) => setFormData({ ...formData, units: parseFloat(e.target.value) })}
            margin="normal"
            inputProps={{ min: 0.01, step: 0.01 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={handleEdit} variant="contained" disabled={loading}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Settle Dialog */}
      <Dialog open={settleOpen} onClose={() => setSettleOpen(false)}>
        <DialogTitle>Settle Bet</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            select
            label="Result"
            value={settleResult}
            onChange={(e) => setSettleResult(e.target.value as 'win' | 'loss' | 'push' | 'void')}
            margin="normal"
          >
            <MenuItem value="win">Win</MenuItem>
            <MenuItem value="loss">Loss</MenuItem>
            <MenuItem value="push">Push</MenuItem>
            <MenuItem value="void">Void</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettleOpen(false)}>Cancel</Button>
          <Button onClick={handleSettle} variant="contained" disabled={loading}>
            Settle
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

