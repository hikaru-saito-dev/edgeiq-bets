'use client';

import { Container, Typography, Box, Button, Paper } from '@mui/material';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function Home() {
  return (
    <Container maxWidth="lg" sx={{ py: 8 }}>
      <motion.div
        initial={{ opacity: 0, y: -30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, type: "spring", stiffness: 100 }}
      >
        <Typography 
          variant="h1" 
          component="h1" 
          sx={{ 
            textAlign: 'center', 
            mb: 4,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 50%, #f59e0b 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 25px rgba(139, 92, 246, 0.8))',
          }}
        >
          EdgeIQ Bets
        </Typography>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        <Typography 
          variant="h5" 
          sx={{ 
            textAlign: 'center',
            color: 'text.secondary',
            mb: 6,
            fontWeight: 300,
          }}
        >
          Track your bets, compete on leaderboards, and prove your edge
        </Typography>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button 
            variant="contained" 
            size="large" 
            component={Link} 
            href="/bets"
            sx={{
              background: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
              color: 'white',
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              fontWeight: 600,
              boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #4f46e5 0%, #db2777 100%)',
                boxShadow: '0 12px 40px rgba(99, 102, 241, 0.4)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.3s ease',
            }}
          >
            View My Bets
          </Button>
          <Button 
            variant="outlined" 
            size="large" 
            component={Link} 
            href="/leaderboard"
            sx={{
              borderColor: 'rgba(99, 102, 241, 0.5)',
              color: 'white',
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              fontWeight: 600,
              '&:hover': {
                borderColor: '#6366f1',
                background: 'rgba(99, 102, 241, 0.1)',
                transform: 'translateY(-2px)',
              },
              transition: 'all 0.3s ease',
            }}
          >
            View Leaderboard
          </Button>
        </Box>
      </motion.div>
    </Container>
  );
}

