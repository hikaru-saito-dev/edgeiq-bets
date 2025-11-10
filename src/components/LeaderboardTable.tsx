'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Box,
  Tabs,
  Tab,
  Typography,
  CircularProgress,
  Skeleton,
} from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface LeaderboardEntry {
  rank: number;
  alias: string;
  winRate: number;
  roi: number;
  plays: number;
  currentStreak: number;
  longestStreak: number;
  membershipUrl: string;
}

export default function LeaderboardTable() {
  const [range, setRange] = useState<'all' | '30d' | '7d'>('all');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/leaderboard?range=${range}`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      const data = await response.json();
      setLeaderboard(data.leaderboard || []);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const getRoiColor = (roi: number) => {
    if (roi > 0) return 'success';
    if (roi < 0) return 'error';
    return 'default';
  };

  const getWinRateColor = (winRate: number) => {
    if (winRate >= 60) return 'success';
    if (winRate >= 50) return 'warning';
    return 'default';
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Leaderboard
        </Typography>
        <Tabs value={range} onChange={(_, v) => setRange(v)}>
          <Tab label="All Time" value="all" />
          <Tab label="30 Days" value="30d" />
          <Tab label="7 Days" value="7d" />
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ py: 4 }}>
          <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" gap={3} mb={4}>
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <CircularProgress 
                size={50}
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
                Loading leaderboard...
              </Typography>
            </motion.div>
          </Box>
          <Box>
            {[1, 2, 3, 4, 5].map((i) => (
              <Paper
                key={i}
                sx={{
                  mb: 2,
                  p: 3,
                  background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: 2,
                }}
              >
                <Box display="flex" alignItems="center" gap={2}>
                  <Skeleton variant="circular" width={40} height={40} sx={{ bgcolor: 'rgba(99, 102, 241, 0.2)' }} />
                  <Box flex={1}>
                    <Skeleton variant="text" width="40%" height={24} sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)', mb: 1 }} />
                    <Skeleton variant="text" width="60%" height={20} sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)' }} />
                  </Box>
                  <Box display="flex" gap={2}>
                    <Skeleton variant="rectangular" width={80} height={40} sx={{ borderRadius: 2, bgcolor: 'rgba(99, 102, 241, 0.2)' }} />
                    <Skeleton variant="rectangular" width={80} height={40} sx={{ borderRadius: 2, bgcolor: 'rgba(236, 72, 153, 0.2)' }} />
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Rank</strong></TableCell>
                <TableCell><strong>Alias</strong></TableCell>
                <TableCell align="right"><strong>Win %</strong></TableCell>
                <TableCell align="right"><strong>ROI %</strong></TableCell>
                <TableCell align="right"><strong>Plays</strong></TableCell>
                <TableCell align="right"><strong>Current Streak</strong></TableCell>
                <TableCell align="right"><strong>Longest Streak</strong></TableCell>
                <TableCell align="center"><strong>Action</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leaderboard.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    No entries found
                  </TableCell>
                </TableRow>
              ) : (
                leaderboard.map((entry) => (
                  <TableRow key={entry.rank} hover>
                    <TableCell>
                      <Chip
                        label={entry.rank}
                        color={entry.rank === 1 ? 'primary' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{entry.alias}</TableCell>
                    <TableCell align="right">
                      <Chip
                        label={`${entry.winRate.toFixed(2)}%`}
                        color={getWinRateColor(entry.winRate)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        label={`${entry.roi >= 0 ? '+' : ''}${entry.roi.toFixed(2)}%`}
                        color={getRoiColor(entry.roi)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">{entry.plays}</TableCell>
                    <TableCell align="right">
                      {entry.currentStreak > 0 && (
                        <Chip 
                          icon={<LocalFireDepartmentIcon />}
                          label={entry.currentStreak} 
                          size="small" 
                          color="warning" 
                        />
                      )}
                      {entry.currentStreak === 0 && '-'}
                    </TableCell>
                    <TableCell align="right">{entry.longestStreak}</TableCell>
                    <TableCell align="center">
                      <Button
                        variant="contained"
                        size="small"
                        href={entry.membershipUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View Membership
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

