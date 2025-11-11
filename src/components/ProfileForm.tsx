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
  CircularProgress,
  Skeleton,
  Avatar,
} from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import { useToast } from './ToastProvider';
import { motion } from 'framer-motion';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Legend, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';

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

interface Bet {
  _id: string;
  eventName: string;
  startTime: string;
  odds: number;
  units: number;
  result: 'pending' | 'win' | 'loss' | 'push' | 'void';
  createdAt: string;
  updatedAt: string;
}

interface UserData {
  alias: string;
  optIn: boolean;
  whopUserId: string;
  companyId: string;
  whopName?: string;
  whopUsername?: string;
  whopDisplayName?: string;
  whopAvatarUrl?: string;
  membershipPlans?: Array<{
    id: string;
    name: string;
    price: string;
    url: string;
    isPremium?: boolean;
  }>;
}

export default function ProfileForm() {
  const toast = useToast();
  const [alias, setAlias] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const [profileResponse, betsResponse] = await Promise.all([
        fetch('/api/user'),
        fetch('/api/bets')
      ]);
      
      if (!profileResponse.ok) throw new Error('Failed to fetch profile');
      if (!betsResponse.ok) throw new Error('Failed to fetch bets');
      
      const profileData = await profileResponse.json();
      const betsData = await betsResponse.json();
      
      setUserData(profileData.user);
      setAlias(profileData.user.alias || profileData.user.whopDisplayName || profileData.user.whopUsername || '');
      setOptIn(profileData.user.optIn);
      setStats(profileData.stats);
      setBets(betsData.bets || []);
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
    return (
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
            Loading profile...
          </Typography>
        </motion.div>
        <Box sx={{ width: '100%', mt: 4 }}>
          <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', backdropFilter: 'blur(20px)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 2 }}>
            <Skeleton variant="text" width="30%" height={32} sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)', mb: 2 }} />
            <Skeleton variant="rectangular" width="100%" height={56} sx={{ borderRadius: 1, bgcolor: 'rgba(255, 255, 255, 0.05)', mb: 2 }} />
            <Skeleton variant="rectangular" width="100%" height={40} sx={{ borderRadius: 1, bgcolor: 'rgba(255, 255, 255, 0.05)' }} />
          </Paper>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' }, background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', backdropFilter: 'blur(20px)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 2 }}>
                <CardContent>
                  <Skeleton variant="text" width="60%" height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)', mb: 1 }} />
                  <Skeleton variant="text" width="40%" height={32} sx={{ bgcolor: 'rgba(255, 255, 255, 0.15)' }} />
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  const pieData = stats ? [
    { name: 'Wins', value: stats.wins, color: '#10b981' },
    { name: 'Losses', value: stats.losses, color: '#ef4444' },
    { name: 'Pushes', value: stats.pushes, color: '#f59e0b' },
    { name: 'Voids', value: stats.voids, color: '#6b7280' },
  ].filter(item => item.value > 0) : [];

  const barData = stats ? [
    { name: 'Wins', value: stats.wins, color: '#10b981' },
    { name: 'Losses', value: stats.losses, color: '#ef4444' },
    { name: 'Pushes', value: stats.pushes, color: '#f59e0b' },
    { name: 'Voids', value: stats.voids, color: '#6b7280' },
  ] : [];

  // Prepare time series data for line charts
  const prepareTimeSeriesData = () => {
    if (!bets || bets.length === 0) return [];
    
    const settledBets = bets.filter(bet => bet.result !== 'pending');
    if (settledBets.length === 0) return [];

    // Group by date and calculate cumulative stats
    const dateMap = new Map<string, { date: string; wins: number; losses: number; unitsPL: number; roi: number; total: number }>();
    
    settledBets
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach((bet) => {
        const date = new Date(bet.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const existing = dateMap.get(date) || { date, wins: 0, losses: 0, unitsPL: 0, roi: 0, total: 0 };
        
        if (bet.result === 'win') {
          existing.wins += 1;
          existing.unitsPL += (bet.odds - 1) * bet.units;
        } else if (bet.result === 'loss') {
          existing.losses += 1;
          existing.unitsPL -= bet.units;
        }
        existing.total += 1;
        
        const winRate = existing.total > 0 ? (existing.wins / existing.total) * 100 : 0;
        existing.roi = existing.total > 0 ? (existing.unitsPL / (existing.total * bet.units)) * 100 : 0;
        
        dateMap.set(date, existing);
      });

    // Convert to cumulative data
    let cumulativeWins = 0;
    let cumulativeLosses = 0;
    let cumulativeUnitsPL = 0;
    let cumulativeTotal = 0;

    return Array.from(dateMap.values()).map((day) => {
      cumulativeWins += day.wins;
      cumulativeLosses += day.losses;
      cumulativeUnitsPL += day.unitsPL;
      cumulativeTotal += day.total;
      
      const winRate = cumulativeTotal > 0 ? (cumulativeWins / cumulativeTotal) * 100 : 0;
      const roi = cumulativeTotal > 0 ? (cumulativeUnitsPL / (cumulativeTotal * (bets[0]?.units || 1))) * 100 : 0;
      
      return {
        date: day.date,
        winRate: parseFloat(winRate.toFixed(2)),
        roi: parseFloat(roi.toFixed(2)),
        unitsPL: parseFloat(cumulativeUnitsPL.toFixed(2)),
        totalBets: cumulativeTotal,
      };
    });
  };

  // Prepare monthly performance data
  const prepareMonthlyData = () => {
    if (!bets || bets.length === 0) return [];
    
    const settledBets = bets.filter(bet => bet.result !== 'pending');
    if (settledBets.length === 0) return [];

    const monthMap = new Map<string, { month: string; wins: number; losses: number; unitsPL: number }>();
    
    settledBets.forEach((bet) => {
      const month = new Date(bet.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const existing = monthMap.get(month) || { month, wins: 0, losses: 0, unitsPL: 0 };
      
      if (bet.result === 'win') {
        existing.wins += 1;
        existing.unitsPL += (bet.odds - 1) * bet.units;
      } else if (bet.result === 'loss') {
        existing.losses += 1;
        existing.unitsPL -= bet.units;
      }
      
      monthMap.set(month, existing);
    });

    return Array.from(monthMap.values()).map((month) => ({
      month: month.month,
      wins: month.wins,
      losses: month.losses,
      unitsPL: parseFloat(month.unitsPL.toFixed(2)),
    }));
  };

  const timeSeriesData = prepareTimeSeriesData();
  const monthlyData = prepareMonthlyData();

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <Avatar
          src={userData?.whopAvatarUrl}
          alt={userData?.whopDisplayName || userData?.alias || 'User'}
          sx={{
            width: 64,
            height: 64,
            border: '3px solid rgba(99, 102, 241, 0.5)',
            background: 'linear-gradient(135deg, #6366f1, #ec4899)',
            boxShadow: '0 4px 20px rgba(99, 102, 241, 0.3)',
          }}
        >
          {(userData?.whopDisplayName || userData?.alias || 'U').charAt(0).toUpperCase()}
        </Avatar>
        <Box>
          <Typography variant="h4" component="h1" sx={{ color: '#ffffff', fontWeight: 700 }}>
            {userData?.whopDisplayName || userData?.alias || 'Profile'}
          </Typography>
          {userData?.whopUsername && (
            <Typography variant="body2" sx={{ color: '#a1a1aa', mt: 0.5 }}>
              @{userData.whopUsername}
            </Typography>
          )}
        </Box>
      </Box>

      <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', backdropFilter: 'blur(20px)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 2 }}>
        <TextField
          fullWidth
          label="Alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          margin="normal"
          sx={{
            '& .MuiOutlinedInput-root': {
              color: '#ffffff',
              '& fieldset': {
                borderColor: 'rgba(99, 102, 241, 0.3)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(99, 102, 241, 0.5)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#6366f1',
              },
            },
            '& .MuiInputLabel-root': {
              color: '#a1a1aa',
            },
          }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={optIn}
              onChange={(e) => setOptIn(e.target.checked)}
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': {
                  color: '#6366f1',
                },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                  backgroundColor: '#6366f1',
                },
              }}
            />
          }
          label="Opt-in to Leaderboard"
          sx={{ mt: 2, color: '#ffffff' }}
        />
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          sx={{ 
            mt: 2,
            background: 'linear-gradient(135deg, #6366f1, #ec4899)',
            '&:hover': {
              background: 'linear-gradient(135deg, #4f46e5, #db2777)',
            },
            '&:disabled': {
              background: 'rgba(99, 102, 241, 0.3)',
            },
          }}
          startIcon={saving ? <CircularProgress size={16} sx={{ color: '#ffffff' }} /> : null}
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </Button>
      </Paper>

      {stats && (
        <Box>
          <Typography variant="h5" component="h2" mb={3} sx={{ color: '#ffffff', fontWeight: 600 }}>
            Your Stats
          </Typography>

          {/* Charts Section */}
          {stats.totalBets > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mb: 4 }}>
              {/* First Row: Pie Chart and Bar Chart */}
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 3 }}>
                {/* Pie Chart */}
                <Paper sx={{ 
                  p: 3, 
                  flex: 1,
                  background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                  backdropFilter: 'blur(20px)', 
                  border: '1px solid rgba(99, 102, 241, 0.3)', 
                  borderRadius: 2 
                }}>
                  <Typography variant="h6" mb={2} sx={{ color: '#ffffff', fontWeight: 600 }}>
                    Bet Results Breakdown
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(15, 15, 35, 0.95)', 
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          borderRadius: '8px',
                          color: '#ffffff'
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ color: '#ffffff' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Paper>

                {/* Bar Chart */}
                <Paper sx={{ 
                  p: 3, 
                  flex: 1,
                  background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                  backdropFilter: 'blur(20px)', 
                  border: '1px solid rgba(99, 102, 241, 0.3)', 
                  borderRadius: 2 
                }}>
                  <Typography variant="h6" mb={2} sx={{ color: '#ffffff', fontWeight: 600 }}>
                    Bet Results Comparison
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(99, 102, 241, 0.2)" />
                      <XAxis 
                        dataKey="name" 
                        stroke="#a1a1aa"
                        tick={{ fill: '#a1a1aa' }}
                      />
                      <YAxis 
                        stroke="#a1a1aa"
                        tick={{ fill: '#a1a1aa' }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'rgba(15, 15, 35, 0.95)', 
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          borderRadius: '8px',
                          color: '#ffffff'
                        }}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#6366f1">
                        {barData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Box>

              {/* Second Row: Line Charts for Performance Trends */}
              {timeSeriesData.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 3 }}>
                  {/* Win Rate Trend Line Chart */}
                  <Paper sx={{ 
                    p: 3, 
                    flex: 1,
                    background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                    backdropFilter: 'blur(20px)', 
                    border: '1px solid rgba(99, 102, 241, 0.3)', 
                    borderRadius: 2 
                  }}>
                    <Typography variant="h6" mb={2} sx={{ color: '#ffffff', fontWeight: 600 }}>
                      Win Rate Trend
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={timeSeriesData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(99, 102, 241, 0.2)" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#a1a1aa"
                          tick={{ fill: '#a1a1aa', fontSize: 12 }}
                        />
                        <YAxis 
                          stroke="#a1a1aa"
                          tick={{ fill: '#a1a1aa' }}
                          label={{ value: 'Win Rate %', angle: -90, position: 'insideLeft', fill: '#a1a1aa' }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(15, 15, 35, 0.95)', 
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            borderRadius: '8px',
                            color: '#ffffff'
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="winRate" 
                          stroke="#10b981" 
                          strokeWidth={3}
                          dot={{ fill: '#10b981', r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Paper>

                  {/* ROI Trend Line Chart */}
                  <Paper sx={{ 
                    p: 3, 
                    flex: 1,
                    background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                    backdropFilter: 'blur(20px)', 
                    border: '1px solid rgba(99, 102, 241, 0.3)', 
                    borderRadius: 2 
                  }}>
                    <Typography variant="h6" mb={2} sx={{ color: '#ffffff', fontWeight: 600 }}>
                      ROI Trend
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={timeSeriesData}>
                        <defs>
                          <linearGradient id="roiGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(99, 102, 241, 0.2)" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#a1a1aa"
                          tick={{ fill: '#a1a1aa', fontSize: 12 }}
                        />
                        <YAxis 
                          stroke="#a1a1aa"
                          tick={{ fill: '#a1a1aa' }}
                          label={{ value: 'ROI %', angle: -90, position: 'insideLeft', fill: '#a1a1aa' }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(15, 15, 35, 0.95)', 
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            borderRadius: '8px',
                            color: '#ffffff'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="roi" 
                          stroke="#6366f1" 
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#roiGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Paper>
                </Box>
              )}

              {/* Third Row: Units P/L Trend and Monthly Performance */}
              {timeSeriesData.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 3 }}>
                  {/* Units P/L Trend */}
                  <Paper sx={{ 
                    p: 3, 
                    flex: 1,
                    background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                    backdropFilter: 'blur(20px)', 
                    border: '1px solid rgba(99, 102, 241, 0.3)', 
                    borderRadius: 2 
                  }}>
                    <Typography variant="h6" mb={2} sx={{ color: '#ffffff', fontWeight: 600 }}>
                      Units Profit/Loss Trend
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={timeSeriesData}>
                        <defs>
                          <linearGradient id="unitsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(99, 102, 241, 0.2)" />
                        <XAxis 
                          dataKey="date" 
                          stroke="#a1a1aa"
                          tick={{ fill: '#a1a1aa', fontSize: 12 }}
                        />
                        <YAxis 
                          stroke="#a1a1aa"
                          tick={{ fill: '#a1a1aa' }}
                          label={{ value: 'Units', angle: -90, position: 'insideLeft', fill: '#a1a1aa' }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'rgba(15, 15, 35, 0.95)', 
                            border: '1px solid rgba(99, 102, 241, 0.3)',
                            borderRadius: '8px',
                            color: '#ffffff'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="unitsPL" 
                          stroke="#10b981" 
                          strokeWidth={3}
                          fillOpacity={1}
                          fill="url(#unitsGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Paper>

                  {/* Monthly Performance Bar Chart */}
                  {monthlyData.length > 0 && (
                    <Paper sx={{ 
                      p: 3, 
                      flex: 1,
                      background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                      backdropFilter: 'blur(20px)', 
                      border: '1px solid rgba(99, 102, 241, 0.3)', 
                      borderRadius: 2 
                    }}>
                      <Typography variant="h6" mb={2} sx={{ color: '#ffffff', fontWeight: 600 }}>
                        Monthly Performance
                      </Typography>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(99, 102, 241, 0.2)" />
                          <XAxis 
                            dataKey="month" 
                            stroke="#a1a1aa"
                            tick={{ fill: '#a1a1aa', fontSize: 12 }}
                          />
                          <YAxis 
                            stroke="#a1a1aa"
                            tick={{ fill: '#a1a1aa' }}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: 'rgba(15, 15, 35, 0.95)', 
                              border: '1px solid rgba(99, 102, 241, 0.3)',
                              borderRadius: '8px',
                              color: '#ffffff'
                            }}
                          />
                          <Legend 
                            wrapperStyle={{ color: '#ffffff' }}
                          />
                          <Bar dataKey="wins" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="losses" stackId="a" fill="#ef4444" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Paper>
                  )}
                </Box>
              )}
            </Box>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(99, 102, 241, 0.3)', 
                borderRadius: 2 
              }}>
                <CardContent>
                  <Typography sx={{ color: '#a1a1aa', mb: 1 }} gutterBottom>
                    Total Bets
                  </Typography>
                  <Typography variant="h4" sx={{ color: '#ffffff', fontWeight: 700 }}>{stats.totalBets}</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(99, 102, 241, 0.3)', 
                borderRadius: 2 
              }}>
                <CardContent>
                  <Typography sx={{ color: '#a1a1aa', mb: 1 }} gutterBottom>
                    Win Rate
                  </Typography>
                  <Typography variant="h4" sx={{ color: '#ffffff', fontWeight: 700 }}>{stats.winRate.toFixed(2)}%</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(99, 102, 241, 0.3)', 
                borderRadius: 2 
              }}>
                <CardContent>
                  <Typography sx={{ color: '#a1a1aa', mb: 1 }} gutterBottom>
                    ROI
                  </Typography>
                  <Typography 
                    variant="h4"
                    sx={{ 
                      color: stats.roi >= 0 ? '#10b981' : '#ef4444', 
                      fontWeight: 700 
                    }}
                  >
                    {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(2)}%
                  </Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(99, 102, 241, 0.3)', 
                borderRadius: 2 
              }}>
                <CardContent>
                  <Typography sx={{ color: '#a1a1aa', mb: 1 }} gutterBottom>
                    Units P/L
                  </Typography>
                  <Typography 
                    variant="h4"
                    sx={{ 
                      color: stats.unitsPL >= 0 ? '#10b981' : '#ef4444', 
                      fontWeight: 700 
                    }}
                  >
                    {stats.unitsPL >= 0 ? '+' : ''}{stats.unitsPL.toFixed(2)}
                  </Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(99, 102, 241, 0.3)', 
                borderRadius: 2 
              }}>
                <CardContent>
                  <Typography sx={{ color: '#a1a1aa', mb: 1 }} gutterBottom>
                    Current Streak
                  </Typography>
                  <Typography variant="h4" display="flex" alignItems="center" gap={1} sx={{ color: '#ffffff', fontWeight: 700 }}>
                    {stats.currentStreak > 0 && <LocalFireDepartmentIcon sx={{ color: '#f59e0b' }} />}
                    {stats.currentStreak}
                  </Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(99, 102, 241, 0.3)', 
                borderRadius: 2 
              }}>
                <CardContent>
                  <Typography sx={{ color: '#a1a1aa', mb: 1 }} gutterBottom>
                    Longest Streak
                  </Typography>
                  <Typography variant="h4" sx={{ color: '#ffffff', fontWeight: 700 }}>{stats.longestStreak}</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(99, 102, 241, 0.3)', 
                borderRadius: 2 
              }}>
                <CardContent>
                  <Typography sx={{ color: '#a1a1aa', mb: 1 }} gutterBottom>
                    Wins
                  </Typography>
                  <Typography variant="h4" sx={{ color: '#10b981', fontWeight: 700 }}>{stats.wins}</Typography>
                </CardContent>
              </Card>
            </Box>
            <Box sx={{ width: { xs: '100%', sm: 'calc(50% - 8px)', md: 'calc(33.333% - 11px)' } }}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))', 
                backdropFilter: 'blur(20px)', 
                border: '1px solid rgba(99, 102, 241, 0.3)', 
                borderRadius: 2 
              }}>
                <CardContent>
                  <Typography sx={{ color: '#a1a1aa', mb: 1 }} gutterBottom>
                    Losses
                  </Typography>
                  <Typography variant="h4" sx={{ color: '#ef4444', fontWeight: 700 }}>{stats.losses}</Typography>
                </CardContent>
              </Card>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

