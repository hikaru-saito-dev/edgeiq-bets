'use client';

import { AppBar, Toolbar, Typography, Button } from '@mui/material';
import Link from 'next/link';

export default function Navigation() {
  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          EdgeIQ Bets
        </Typography>
        <Button color="inherit" component={Link} href="/bets">
          Bets
        </Button>
        <Button color="inherit" component={Link} href="/leaderboard">
          Leaderboard
        </Button>
        <Button color="inherit" component={Link} href="/profile">
          Profile
        </Button>
      </Toolbar>
    </AppBar>
  );
}

