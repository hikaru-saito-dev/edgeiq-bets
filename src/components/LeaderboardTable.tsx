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
} from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import { useState, useEffect } from 'react';

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
        <Typography>Loading...</Typography>
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

