'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Typography,
  Paper,
  Card,
  CardContent,
} from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import { useToast } from './ToastProvider';

interface UserStats {
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  winRate: number;
  roi: number;
  unitsPL: number;
  currentStreak: number;
  longestStreak: number;
}

export default function ProfileForm() {
  const toast = useToast();
  const [alias, setAlias] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await fetch('/api/user');
      if (!response.ok) throw new Error('Failed to fetch profile');
      const data = await response.json();
      setAlias(data.user.alias);
      setOptIn(data.user.optIn);
      setStats(data.stats);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, optIn }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to update profile' }));
        toast.showError(error.error || 'Failed to update profile');
        return;
      }

      // Refresh stats
      await fetchProfile();
      toast.showSuccess('Profile updated successfully!');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile';
      toast.showError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <Box>
      <Typography variant="h4" component="h1" mb={3}>
        Profile
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <TextField
          fullWidth
          label="Alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          margin="normal"
        />
        <FormControlLabel
          control={
            <Switch
              checked={optIn}
              onChange={(e) => setOptIn(e.target.checked)}
            />
          }
          label="Opt-in to Leaderboard"
          sx={{ mt: 2 }}
        />
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          sx={{ mt: 2 }}
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </Paper>

      {stats && (
        <Box>
          <Typography variant="h5" component="h2" mb={2}>
            Your Stats
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Total Bets
                  </Typography>
                  <Typography variant="h4">{stats.totalBets}</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Win Rate
                  </Typography>
                  <Typography variant="h4">{stats.winRate.toFixed(2)}%</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    ROI
                  </Typography>
                  <Typography 
                    variant="h4"
                    color={stats.roi >= 0 ? 'success.main' : 'error.main'}
                  >
                    {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(2)}%
                  </Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Units P/L
                  </Typography>
                  <Typography 
                    variant="h4"
                    color={stats.unitsPL >= 0 ? 'success.main' : 'error.main'}
                  >
                    {stats.unitsPL >= 0 ? '+' : ''}{stats.unitsPL.toFixed(2)}
                  </Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Current Streak
                  </Typography>
                  <Typography variant="h4" display="flex" alignItems="center" gap={1}>
                    {stats.currentStreak > 0 && <LocalFireDepartmentIcon color="warning" />}
                    {stats.currentStreak}
                  </Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Longest Streak
                  </Typography>
                  <Typography variant="h4">{stats.longestStreak}</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Wins
                  </Typography>
                  <Typography variant="h4" color="success.main">{stats.wins}</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Losses
                  </Typography>
                  <Typography variant="h4" color="error.main">{stats.losses}</Typography>
                </CardContent>
              </Card>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

