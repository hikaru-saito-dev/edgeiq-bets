import { Container, Typography, Box, Button } from '@mui/material';
import Link from 'next/link';

export default function Home() {
  return (
    <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
      <Typography variant="h2" component="h1" gutterBottom>
        Welcome to EdgeIQ Bets
      </Typography>
      <Typography variant="h5" color="text.secondary" paragraph>
        Track your bets, compete on leaderboards, and prove your edge
      </Typography>
      <Box sx={{ mt: 4, display: 'flex', gap: 2, justifyContent: 'center' }}>
        <Button variant="contained" size="large" component={Link} href="/bets">
          View My Bets
        </Button>
        <Button variant="outlined" size="large" component={Link} href="/leaderboard">
          View Leaderboard
        </Button>
      </Box>
    </Container>
  );
}

