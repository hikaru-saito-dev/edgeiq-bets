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
  CircularProgress,
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
          background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))',
          backdropFilter: 'blur(20px)',
          border: bet.locked ? '2px solid rgba(245, 158, 11, 0.5)' : '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: 3,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          transition: 'all 0.3s ease',
          '&:hover': {
            boxShadow: '0 12px 40px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            transform: 'translateY(-4px)',
            borderColor: bet.locked ? 'rgba(245, 158, 11, 0.7)' : 'rgba(99, 102, 241, 0.5)',
          }
        }}
      >
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
            <Box flex={1}>
              <Typography variant="h6" component="div" fontWeight={600} mb={0.5} sx={{ color: '#ffffff' }}>
                {bet.eventName}
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <EventIcon fontSize="small" sx={{ color: '#a1a1aa' }} />
                <Typography variant="body2" sx={{ color: '#a1a1aa' }}>
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

          

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            <Box 
              sx={{ 
                p: 1.5, 
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.1))',
                borderRadius: 2,
                textAlign: 'center',
                width: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}
            >
              <TrendingUpIcon fontSize="small" sx={{ mb: 0.5, color: '#818cf8' }} />
              <Typography variant="caption" display="block" sx={{ color: '#a1a1aa', fontWeight: 600 }}>
                Odds
              </Typography>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#ffffff' }}>
                {bet.odds.toFixed(2)}
              </Typography>
            </Box>
            <Box 
              sx={{ 
                p: 1.5, 
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1))',
                borderRadius: 2,
                textAlign: 'center',
                width: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                border: '1px solid rgba(34, 197, 94, 0.3)',
              }}
            >
              <AttachMoneyIcon fontSize="small" sx={{ mb: 0.5, color: '#4ade80' }} />
              <Typography variant="caption" display="block" sx={{ color: '#a1a1aa', fontWeight: 600 }}>
                Units
              </Typography>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#ffffff' }}>
                {bet.units.toFixed(2)}
              </Typography>
            </Box>
            <Box 
              sx={{ 
                p: 1.5, 
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1))',
                borderRadius: 2,
                textAlign: 'center',
                width: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}
            >
              <CalculateIcon fontSize="small" sx={{ mb: 0.5, color: '#60a5fa' }} />
              <Typography variant="caption" display="block" sx={{ color: '#a1a1aa', fontWeight: 600 }}>
                Potential Win
              </Typography>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#ffffff' }}>
                +{potentialPayout.toFixed(2)}
              </Typography>
            </Box>
            <Box 
              sx={{ 
                p: 1.5, 
                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(236, 72, 153, 0.1))',
                borderRadius: 2,
                textAlign: 'center',
                width: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(25% - 12px)' },
                border: '1px solid rgba(236, 72, 153, 0.3)',
              }}
            >
              <AttachMoneyIcon fontSize="small" sx={{ mb: 0.5, color: '#f472b6' }} />
              <Typography variant="caption" display="block" sx={{ color: '#a1a1aa', fontWeight: 600 }}>
                Total Return
              </Typography>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#ffffff' }}>
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
            {bet.result === 'pending' && (() => {
              const now = new Date();
              const startTime = new Date(bet.startTime);
              const canSettle = now >= startTime;
              
              return (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => setSettleOpen(true)}
                  color="primary"
                  disabled={!canSettle}
                  title={!canSettle ? 'Cannot settle bet before event start time' : ''}
                >
                  Settle Bet
                </Button>
              );
            })()}
            {/* Delete button, only for bets that are not locked, not settled, and before start time */}
            {bet.result === 'pending' && (() => {
              const now = new Date();
              const startTime = new Date(bet.startTime);
              const canDelete = !bet.locked && now < startTime;
              
              if (!canDelete) return null;
              
              return (
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  disabled={loading}
                  onClick={async () => {
                    if (!window.confirm('Are you sure you want to delete this bet?')) return;
                    setLoading(true);
                    try {
                      const res = await fetch('/api/bets', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ betId: bet._id })
                      });
                      if (res.ok) {
                        toast.showSuccess('Bet deleted.');
                        if (onUpdate) onUpdate();
                      } else {
                        const error = await res.json();
                        toast.showError(error.error || 'Failed to delete bet');
                      }
                    } catch (err) {
                      if (err instanceof Error) {
                        toast.showError(err.message);
                      } else {
                        toast.showError('Failed to delete bet');
                      }
                    } finally {
                      setLoading(false);
                    }
                  }}
                  style={{ marginLeft: 8 }}
                >
                  Delete
                </Button>
              );
            })()}
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
          <Button 
            onClick={handleEdit} 
            variant="contained" 
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} sx={{ color: 'white' }} /> : null}
            sx={{
              background: loading ? 'rgba(99, 102, 241, 0.5)' : 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
              '&:hover': {
                background: loading ? 'rgba(99, 102, 241, 0.5)' : 'linear-gradient(135deg, #4f46e5 0%, #db2777 100%)',
              },
            }}
          >
            {loading ? 'Saving...' : 'Save'}
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
          <Button 
            onClick={handleSettle} 
            variant="contained" 
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} sx={{ color: 'white' }} /> : null}
            sx={{
              background: loading ? 'rgba(99, 102, 241, 0.5)' : 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
              '&:hover': {
                background: loading ? 'rgba(99, 102, 241, 0.5)' : 'linear-gradient(135deg, #4f46e5 0%, #db2777 100%)',
              },
            }}
          >
            {loading ? 'Settling...' : 'Settle'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

