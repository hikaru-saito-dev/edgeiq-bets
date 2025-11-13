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
  Skeleton,
  Avatar,
} from '@mui/material';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import { useState, useEffect } from 'react';

interface LeaderboardEntry {
  rank: number;
  companyId: string;
  companyName: string;
  whopName?: string;
  whopAvatarUrl?: string;
  membershipAffiliateLink?: string | null;
  winRate: number;
  roi: number;
  plays: number;
  currentStreak: number;
  longestStreak: number;
  memberCount: number;
}

export default function LeaderboardTable() {
  const [range, setRange] = useState<'all' | '30d' | '7d'>('all');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // pagination + search
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range, page: String(page), pageSize: String(pageSize) });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`/api/leaderboard?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch leaderboard');
      const data = await response.json();
      setLeaderboard(data.leaderboard || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, page, pageSize]);

  // Debounced search-as-you-type
  useEffect(() => {
    const handle = setTimeout(() => {
      setPage(1);
      fetchLeaderboard();
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const getRoiColor = (roi: number) => (roi >= 0 ? 'success' : 'error');

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={2} flexWrap="wrap">
        <Tabs value={range} onChange={(_, v) => { setRange(v); setPage(1); }}>
          <Tab label="All" value="all" />
          <Tab label="30d" value="30d" />
          <Tab label="7d" value="7d" />
        </Tabs>
        <Box display="flex" gap={1} alignItems="center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { setPage(1); fetchLeaderboard(); } }}
            placeholder="Search companies (name)"
            style={{ background: 'transparent', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '8px 10px', color: '#fff', width: 260 }}
          />
          <Button variant="outlined" size="small" onClick={() => { setPage(1); fetchLeaderboard(); }}>Search</Button>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>Page size</Typography>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }}
            style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6, padding: '8px 10px' }}
          >
            {[10, 20, 50].map((s) => (
              <option key={s} value={s} style={{ color: '#000' }}>{s}</option>
            ))}
          </select>
        </Box>
      </Box>

      {loading ? (
        <Box>
          {[...Array(5)].map((_, i) => (
            <Paper key={i} sx={{ p: 2, mb: 2 }}>
              <Box display="flex" alignItems="center" gap={2}>
                <Skeleton variant="circular" width={32} height={32} sx={{ bgcolor: 'rgba(255,255,255,0.12)' }} />
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
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Rank</strong></TableCell>
                <TableCell><strong>Company</strong></TableCell>
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
                  <TableRow key={entry.companyId} hover>
                    <TableCell>
                      <Chip 
                        label={`#${entry.rank}`}
                        color="primary"
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Avatar src={entry.whopAvatarUrl} sx={{ width: 32, height: 32 }}>
                          {(entry.companyName || '?').charAt(0).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" sx={{ color: '#fff', fontWeight: 500 }}>
                            {entry.companyName}
                          </Typography>
                          {entry.whopName && entry.whopName !== entry.companyName && (
                            <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                              {entry.whopName}
                            </Typography>
                          )}
                          <Typography variant="caption" sx={{ color: '#6366f1', display: 'block', mt: 0.25 }}>
                            {entry.memberCount} {entry.memberCount === 1 ? 'member' : 'members'}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Chip 
                        label={`${entry.winRate.toFixed(1)}%`}
                        color={entry.winRate >= 50 ? 'success' : 'default'}
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
                      {entry.membershipAffiliateLink ? (
                        <Button
                          variant="contained"
                          size="small"
                          href={entry.membershipAffiliateLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            background: 'linear-gradient(135deg, #6366f1, #ec4899)',
                            color: 'white',
                            '&:hover': {
                              background: 'linear-gradient(135deg, #4f46e5, #db2777)',
                            },
                          }}
                        >
                          View Membership
                        </Button>
                      ) : (
                        <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                          No membership
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <Box display="flex" justifyContent="center" py={2} gap={2} alignItems="center">
            <Button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Typography variant="body2" color="text.secondary">Page {page} / {totalPages}</Typography>
            <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </Box>
        </TableContainer>
      )}
    </Box>
  );
}

