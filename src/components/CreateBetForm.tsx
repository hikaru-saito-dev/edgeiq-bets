'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
  CircularProgress,
  Divider,
  Autocomplete,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Collapse,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SearchIcon from '@mui/icons-material/Search';
import { useToast } from './ToastProvider';
import { MarketType } from '@/models/Bet';
import { americanToDecimal, formatOdds, type OddsFormat } from '@/utils/oddsConverter';

interface Game {
  provider?: string;
  providerEventId?: string;
  sport?: string;
  league?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  startTime: string;
}

interface CreateBetFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateBetForm({ open, onClose, onSuccess }: CreateBetFormProps) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [searchingGames, setSearchingGames] = useState(false);
  const [gameSearchQuery, setGameSearchQuery] = useState('');
  const [gameResults, setGameResults] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Form state
  const [marketType, setMarketType] = useState<MarketType>('ML');
  const [selection, setSelection] = useState('');
  const [line, setLine] = useState<number | ''>('');
  const [overUnder, setOverUnder] = useState<'Over' | 'Under' | ''>('');
  const [playerName, setPlayerName] = useState('');
  const [statType, setStatType] = useState('');
  const [parlaySummary, setParlaySummary] = useState('');
  
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>('american');
  const [oddsValue, setOddsValue] = useState<number | ''>('');
  const [units, setUnits] = useState<number | ''>('');
  
  const [book, setBook] = useState('');
  const [notes, setNotes] = useState('');
  const [slipImageUrl, setSlipImageUrl] = useState('');

  // Search for games
  const searchGames = async (query: string) => {
    if (!query || query.trim().length === 0) {
      setGameResults([]);
      return;
    }
    
    setSearchingGames(true);
    try {
      const response = await fetch(`/api/games/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Failed to search games');
      const data = await response.json();
      setGameResults(data.games || []);
    } catch (error) {
      console.error('Error searching games:', error);
      setGameResults([]);
    } finally {
      setSearchingGames(false);
    }
  };

  // Handle game selection
  const handleGameSelect = (game: Game | null) => {
    setSelectedGame(game);
    // Reset selection when game changes
    setSelection('');
    if (game) {
      // Auto-fill form fields from selected game
      // Fields are already in game object
    }
  };

  // Calculate preview values
  const calculatePreview = () => {
    if (typeof oddsValue !== 'number' || typeof units !== 'number') {
      return null;
    }

    const decimalOdds = oddsFormat === 'decimal' 
      ? oddsValue 
      : americanToDecimal(oddsValue);
    
    const profit = units * (decimalOdds - 1);
    const totalReturn = units * decimalOdds;

    return { profit, totalReturn };
  };

  const preview = calculatePreview();

  // Handle form submission
  const handleSubmit = async () => {
    // Validation
    if (!selectedGame || (!selectedGame.homeTeam || !selectedGame.awayTeam || !selectedGame.startTime)) {
      toast.showError('Please select a game or enter game details');
      return;
    }

    if (typeof oddsValue !== 'number') {
      toast.showError('Please enter odds');
      return;
    }

    if (typeof units !== 'number') {
      toast.showError('Please enter units');
      return;
    }

    // Market-specific validation
    if (marketType === 'ML' && !selection) {
      toast.showError('Please select a team');
      return;
    }
    if (marketType === 'Spread' && (!selection || typeof line !== 'number')) {
      toast.showError('Please select a team and enter the line');
      return;
    }
    if (marketType === 'Total' && (typeof line !== 'number' || !overUnder)) {
      toast.showError('Please enter the line and select Over/Under');
      return;
    }
    if (marketType === 'Player Prop' && (!playerName || !statType || typeof line !== 'number' || !overUnder)) {
      toast.showError('Please fill in all player prop fields');
      return;
    }
    if (marketType === 'Parlay' && !parlaySummary) {
      toast.showError('Please enter parlay summary');
      return;
    }

    setSubmitting(true);
    try {
      if (typeof oddsValue === 'string' || typeof units === 'string') {
        toast.showError('Invalid odds or units value');
        return;
      }

      const gameData: Game = selectedGame || {
        homeTeam: '',
        awayTeam: '',
        startTime: new Date().toISOString(),
      };

      const payload = {
        game: {
          provider: gameData.provider,
          providerEventId: gameData.providerEventId,
          sport: gameData.sport,
          league: gameData.league,
          homeTeam: gameData.homeTeam,
          awayTeam: gameData.awayTeam,
          homeTeamId: gameData.homeTeamId,
          awayTeamId: gameData.awayTeamId,
          startTime: gameData.startTime,
        },
        market: {
          marketType,
          ...(marketType === 'ML' && { selection }),
          ...(marketType === 'Spread' && { selection, line }),
          ...(marketType === 'Total' && { line, overUnder }),
          ...(marketType === 'Player Prop' && { playerName, statType, line, overUnder }),
          ...(marketType === 'Parlay' && { parlaySummary }),
        },
        odds: {
          oddsFormat,
          oddsValue: oddsValue as number,
        },
        units: units as number,
        ...(book && { book }),
        ...(notes && { notes }),
        ...(slipImageUrl && { slipImageUrl }),
      };

      const response = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to create bet' }));
        toast.showError(error.error || 'Failed to create bet');
        return;
      }

      // Reset form
      setSelectedGame(null);
      setGameSearchQuery('');
      setMarketType('ML');
      setSelection('');
      setLine('');
      setOverUnder('');
      setPlayerName('');
      setStatType('');
      setParlaySummary('');
      setOddsValue('');
      setUnits('');
      setBook('');
      setNotes('');
      setSlipImageUrl('');
      setShowAdvanced(false);

      toast.showSuccess('Bet created successfully!');
      onSuccess();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create bet';
      toast.showError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Get available teams from selected game
  const getAvailableTeams = (): string[] => {
    if (!selectedGame || !selectedGame.homeTeam || !selectedGame.awayTeam) {
      return [];
    }
    return [selectedGame.awayTeam, selectedGame.homeTeam];
  };

  const availableTeams = getAvailableTeams();

  // Render market-specific inputs
  const renderMarketInputs = () => {
    switch (marketType) {
      case 'ML':
        return (
          <FormControl fullWidth required>
            <InputLabel sx={{ color: '#a1a1aa' }}>Team *</InputLabel>
            <Select
              value={selection}
              onChange={(e) => setSelection(e.target.value)}
              label="Team *"
              disabled={!selectedGame || availableTeams.length === 0}
              sx={{
                color: '#ffffff',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(99, 102, 241, 0.5)' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1' },
                '&.Mui-disabled': { color: 'rgba(255, 255, 255, 0.5)' },
              }}
            >
              {availableTeams.map((team) => (
                <MenuItem key={team} value={team} sx={{ color: '#ffffff' }}>
                  {team}
                </MenuItem>
              ))}
            </Select>
            {!selectedGame && (
              <Typography variant="caption" sx={{ color: '#a1a1aa', mt: 0.5 }}>
                Please select a game first
              </Typography>
            )}
          </FormControl>
        );
      
      case 'Spread':
        return (
          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
            <FormControl fullWidth required>
              <InputLabel sx={{ color: '#a1a1aa' }}>Team *</InputLabel>
              <Select
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                label="Team *"
                disabled={!selectedGame || availableTeams.length === 0}
                sx={{
                  color: '#ffffff',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(99, 102, 241, 0.5)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1' },
                  '&.Mui-disabled': { color: 'rgba(255, 255, 255, 0.5)' },
                }}
              >
                {availableTeams.map((team) => (
                  <MenuItem key={team} value={team} sx={{ color: '#ffffff' }}>
                    {team}
                  </MenuItem>
                ))}
              </Select>
              {!selectedGame && (
                <Typography variant="caption" sx={{ color: '#a1a1aa', mt: 0.5 }}>
                  Please select a game first
                </Typography>
              )}
            </FormControl>
            <TextField
              fullWidth
              label="Line *"
              type="number"
              value={line}
              onChange={(e) => setLine(e.target.value ? parseFloat(e.target.value) : '')}
              required
              inputProps={{ step: 0.5 }}
              sx={{
                '& .MuiOutlinedInput-root': { color: '#ffffff' },
                '& .MuiInputLabel-root': { color: '#a1a1aa' },
                '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
              }}
            />
          </Box>
        );
      
      case 'Total':
        return (
          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField
              fullWidth
              label="Line *"
              type="number"
              value={line}
              onChange={(e) => setLine(e.target.value ? parseFloat(e.target.value) : '')}
              required
              inputProps={{ step: 0.5 }}
              sx={{
                '& .MuiOutlinedInput-root': { color: '#ffffff' },
                '& .MuiInputLabel-root': { color: '#a1a1aa' },
                '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
              }}
            />
            <FormControl fullWidth required>
              <InputLabel sx={{ color: '#a1a1aa' }}>Over/Under *</InputLabel>
              <Select
                value={overUnder}
                onChange={(e) => setOverUnder(e.target.value as 'Over' | 'Under')}
                label="Over/Under *"
                sx={{
                  color: '#ffffff',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(99, 102, 241, 0.5)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1' },
                }}
              >
                <MenuItem value="Over">Over</MenuItem>
                <MenuItem value="Under">Under</MenuItem>
              </Select>
            </FormControl>
          </Box>
        );
      
      case 'Player Prop':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Player Name *"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              required
              sx={{
                '& .MuiOutlinedInput-root': { color: '#ffffff' },
                '& .MuiInputLabel-root': { color: '#a1a1aa' },
                '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
              }}
            />
            <TextField
              fullWidth
              label="Stat Type *"
              value={statType}
              onChange={(e) => setStatType(e.target.value)}
              required
              placeholder="e.g., Points, Rebounds, Assists"
              sx={{
                '& .MuiOutlinedInput-root': { color: '#ffffff' },
                '& .MuiInputLabel-root': { color: '#a1a1aa' },
                '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
              }}
            />
            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
              <TextField
                fullWidth
                label="Line *"
                type="number"
                value={line}
                onChange={(e) => setLine(e.target.value ? parseFloat(e.target.value) : '')}
                required
                inputProps={{ step: 0.5 }}
                sx={{
                  '& .MuiOutlinedInput-root': { color: '#ffffff' },
                  '& .MuiInputLabel-root': { color: '#a1a1aa' },
                  '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                }}
              />
              <FormControl fullWidth required>
                <InputLabel sx={{ color: '#a1a1aa' }}>Over/Under *</InputLabel>
                <Select
                  value={overUnder}
                  onChange={(e) => setOverUnder(e.target.value as 'Over' | 'Under')}
                  label="Over/Under *"
                  sx={{
                    color: '#ffffff',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                  }}
                >
                  <MenuItem value="Over">Over</MenuItem>
                  <MenuItem value="Under">Under</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        );
      
      case 'Parlay':
        return (
          <TextField
            fullWidth
            label="Parlay Summary *"
            value={parlaySummary}
            onChange={(e) => setParlaySummary(e.target.value)}
            required
            multiline
            rows={3}
            placeholder="e.g., Lakers ML + Celtics -5.5 + Over 220.5"
            sx={{
              '& .MuiOutlinedInput-root': { color: '#ffffff' },
              '& .MuiInputLabel-root': { color: '#a1a1aa' },
              '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
            }}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { 
          borderRadius: 2,
          background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.95), rgba(30, 30, 60, 0.9))',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
        }
      }}
    >
      <DialogTitle sx={{ 
        background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))',
        borderBottom: '1px solid rgba(99, 102, 241, 0.3)',
      }}>
        <Box display="flex" alignItems="center" gap={1}>
          <AddIcon sx={{ color: '#6366f1' }} />
          <Typography variant="h6" fontWeight={600} sx={{ color: '#ffffff' }}>
            Create New Bet
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ 
        background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))',
      }}>
        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Game Selection */}
          <Box>
            <Typography variant="subtitle2" sx={{ color: '#ffffff', mb: 1, fontWeight: 600 }}>
              Game *
            </Typography>
            <Autocomplete
              options={gameResults}
              loading={searchingGames}
              onInputChange={(_, value) => {
                setGameSearchQuery(value);
                searchGames(value);
              }}
              onChange={(_, value) => handleGameSelect(value)}
              value={selectedGame}
              getOptionLabel={(option) => {
                if (option.homeTeam && option.awayTeam) {
                  return `${option.awayTeam} @ ${option.homeTeam}`;
                }
                return gameSearchQuery;
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search for a game..."
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: '#6366f1' }} />
                        </InputAdornment>
                        {params.InputProps.startAdornment}
                      </>
                    ),
                    endAdornment: (
                      <>
                        {searchingGames ? <CircularProgress size={20} sx={{ color: '#6366f1' }} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': { color: '#ffffff' },
                    '& .MuiInputLabel-root': { color: '#a1a1aa' },
                    '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                  }}
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props} sx={{ color: '#ffffff' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>
                      {option.awayTeam} @ {option.homeTeam}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#a1a1aa' }}>
                      {option.league} • {new Date(option.startTime).toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              )}
            />
            {selectedGame && (
              <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {selectedGame.league && <Chip label={selectedGame.league} size="small" sx={{ bgcolor: 'rgba(99, 102, 241, 0.2)', color: '#ffffff' }} />}
                {selectedGame.provider && <Chip label={selectedGame.provider} size="small" sx={{ bgcolor: 'rgba(99, 102, 241, 0.2)', color: '#ffffff' }} />}
              </Box>
            )}
          </Box>

          {/* Market Type Selection */}
          <Box>
            <Typography variant="subtitle2" sx={{ color: '#ffffff', mb: 1, fontWeight: 600 }}>
              Market & Selection *
            </Typography>
            <FormControl fullWidth>
              <InputLabel sx={{ color: '#a1a1aa' }}>Market Type *</InputLabel>
              <Select
                value={marketType}
                onChange={(e) => {
                  setMarketType(e.target.value as MarketType);
                  // Reset market-specific fields
                  setSelection('');
                  setLine('');
                  setOverUnder('');
                  setPlayerName('');
                  setStatType('');
                  setParlaySummary('');
                }}
                label="Market Type *"
                sx={{
                  color: '#ffffff',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(99, 102, 241, 0.5)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6366f1' },
                }}
              >
                <MenuItem value="ML">Moneyline (ML)</MenuItem>
                <MenuItem value="Spread">Spread</MenuItem>
                <MenuItem value="Total">Total (Over/Under)</MenuItem>
                <MenuItem value="Player Prop">Player Prop</MenuItem>
                <MenuItem value="Parlay">Parlay</MenuItem>
              </Select>
            </FormControl>
            
            <Box sx={{ mt: 2 }}>
              {renderMarketInputs()}
            </Box>
          </Box>

          {/* Odds & Stake */}
          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" sx={{ color: '#ffffff', mb: 1, fontWeight: 600 }}>
                Odds *
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Button
                  size="small"
                  variant={oddsFormat === 'american' ? 'contained' : 'outlined'}
                  onClick={() => setOddsFormat('american')}
                  sx={{
                    minWidth: 100,
                    ...(oddsFormat === 'american' 
                      ? { background: 'linear-gradient(135deg, #6366f1, #ec4899)' }
                      : { borderColor: 'rgba(99, 102, 241, 0.3)', color: '#ffffff' }
                    ),
                  }}
                >
                  American
                </Button>
                <Button
                  size="small"
                  variant={oddsFormat === 'decimal' ? 'contained' : 'outlined'}
                  onClick={() => setOddsFormat('decimal')}
                  sx={{
                    minWidth: 100,
                    ...(oddsFormat === 'decimal' 
                      ? { background: 'linear-gradient(135deg, #6366f1, #ec4899)' }
                      : { borderColor: 'rgba(99, 102, 241, 0.3)', color: '#ffffff' }
                    ),
                  }}
                >
                  Decimal
                </Button>
              </Box>
              <TextField
                fullWidth
                label={oddsFormat === 'american' ? 'Odds (e.g., -150 or +180)' : 'Odds (e.g., 2.0 or 1.5)'}
                type="number"
                value={oddsValue}
                onChange={(e) => {
                  const val = e.target.value;
                  setOddsValue(val ? parseFloat(val) : '');
                }}
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <TrendingUpIcon sx={{ color: '#6366f1' }} />
                    </InputAdornment>
                  ),
                }}
                helperText={
                  oddsFormat === 'american' 
                    ? 'Enter -150 (favorite) or +180 (underdog)'
                    : 'Enter 2.0 (even) or 1.5 (favorite)'
                }
                sx={{
                  '& .MuiOutlinedInput-root': { color: '#ffffff' },
                  '& .MuiInputLabel-root': { color: '#a1a1aa' },
                  '& .MuiFormHelperText-root': { color: '#a1a1aa' },
                  '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                }}
              />
              {typeof oddsValue === 'number' && (
                <Typography variant="caption" sx={{ color: '#a1a1aa', mt: 0.5, display: 'block' }}>
                  {oddsFormat === 'american' 
                    ? `Decimal: ${americanToDecimal(oddsValue).toFixed(2)}`
                    : `American: ${formatOdds(oddsValue, 'american')}`
                  }
                </Typography>
              )}
            </Box>
            
            <Box sx={{ flex: 1 }}>
              <TextField
                fullWidth
                label="Stake (Units) *"
                type="number"
                value={units}
                onChange={(e) => setUnits(e.target.value ? parseFloat(e.target.value) : '')}
                required
                inputProps={{ min: 0.01, step: 0.01 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <AttachMoneyIcon sx={{ color: '#6366f1' }} />
                    </InputAdornment>
                  ),
                }}
                helperText="Minimum: 0.01 units"
                sx={{
                  '& .MuiOutlinedInput-root': { color: '#ffffff' },
                  '& .MuiInputLabel-root': { color: '#a1a1aa' },
                  '& .MuiFormHelperText-root': { color: '#a1a1aa' },
                  '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                }}
              />
            </Box>
          </Box>

          {/* Bet Preview */}
          {preview && (
            <>
              <Divider sx={{ borderColor: 'rgba(99, 102, 241, 0.3)' }} />
              <Box sx={{ 
                p: 2, 
                borderRadius: 1,
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
              }}>
                <Typography variant="subtitle2" sx={{ color: '#ffffff', mb: 1, fontWeight: 600 }}>
                  Bet Preview
                </Typography>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Potential Win:</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#10b981' }}>
                    +{preview.profit.toFixed(2)} units
                  </Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: '#a1a1aa' }}>Total Return:</Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ color: '#ffffff' }}>
                    {preview.totalReturn.toFixed(2)} units
                  </Typography>
                </Box>
              </Box>
            </>
          )}

          {/* Advanced Options */}
          <Box>
            <Button
              onClick={() => setShowAdvanced(!showAdvanced)}
              endIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ color: '#a1a1aa', textTransform: 'none' }}
            >
              Advanced Options
            </Button>
            <Collapse in={showAdvanced}>
              <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Autocomplete
                  freeSolo
                  options={['Fanduel', 'DraftKings', 'BetMGM', 'Caesars', 'Fanatics']}
                  value={book}
                  onInputChange={(_, value) => setBook(value)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Book"
                      placeholder="e.g., Fanduel, DraftKings"
                      sx={{
                        '& .MuiOutlinedInput-root': { color: '#ffffff' },
                        '& .MuiInputLabel-root': { color: '#a1a1aa' },
                        '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                      }}
                    />
                  )}
                />
                <TextField
                  fullWidth
                  label="Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  multiline
                  rows={3}
                  placeholder="Add any notes about this bet..."
                  sx={{
                    '& .MuiOutlinedInput-root': { color: '#ffffff' },
                    '& .MuiInputLabel-root': { color: '#a1a1aa' },
                    '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                  }}
                />
                <TextField
                  fullWidth
                  label="Slip Image URL"
                  value={slipImageUrl}
                  onChange={(e) => setSlipImageUrl(e.target.value)}
                  placeholder="https://..."
                  helperText="URL to uploaded bet slip image"
                  sx={{
                    '& .MuiOutlinedInput-root': { color: '#ffffff' },
                    '& .MuiInputLabel-root': { color: '#a1a1aa' },
                    '& .MuiFormHelperText-root': { color: '#a1a1aa' },
                    '& fieldset': { borderColor: 'rgba(99, 102, 241, 0.3)' },
                  }}
                />
              </Box>
            </Collapse>
          </Box>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ 
        p: 3, 
        pt: 2,
        background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.9), rgba(30, 30, 60, 0.8))',
        borderTop: '1px solid rgba(99, 102, 241, 0.3)',
      }}>
        <Button 
          onClick={onClose} 
          size="large"
          sx={{
            color: '#a1a1aa',
            '&:hover': {
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              color: '#ffffff',
            },
          }}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          disabled={submitting}
          size="large"
          startIcon={submitting ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <AddIcon />}
          sx={{
            background: submitting ? 'rgba(99, 102, 241, 0.5)' : 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
            color: '#ffffff',
            '&:hover': {
              background: submitting ? 'rgba(99, 102, 241, 0.5)' : 'linear-gradient(135deg, #4f46e5 0%, #db2777 100%)',
            },
            '&:disabled': {
              background: 'rgba(99, 102, 241, 0.3)',
              color: 'rgba(255, 255, 255, 0.5)',
            },
          }}
        >
          {submitting ? 'Creating...' : 'Create Bet'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

