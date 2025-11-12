import { getWhopSdk } from './whop';
import type { IBet } from '@/models/Bet';
import type { IUser } from '@/models/User';

const EXPERIENCE_ID_ENV_KEY = 'WHOP_BET_NOTIFICATIONS_EXPERIENCE_ID';

function getExperienceId(): string | null {
  const experienceId = process.env[EXPERIENCE_ID_ENV_KEY];
  if (!experienceId) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[betNotifications] ${EXPERIENCE_ID_ENV_KEY} not set. Skipping message send.`);
    }
    return null;
  }
  return experienceId;
}

async function sendMessage(message: string, companyId?: string): Promise<void> {
  const experienceId = getExperienceId();
  if (!experienceId) {
    console.warn('[betNotifications] Experience ID not configured. Set WHOP_BET_NOTIFICATIONS_EXPERIENCE_ID in env.');
    return;
  }
  if (!message.trim()) return;

  try {
    // Initialize SDK with companyId directly (like the working backend does)
    const whopSdk = getWhopSdk(companyId);
    
    const result = await whopSdk.messages.sendMessageToChat({
      experienceId,
      message,
    });
    
    // Check for errors in the response
    if (result && typeof result === 'object' && '_error' in result) {
      console.error('[betNotifications] API error:', result._error);
      return;
    }
    
    // Success: API returns a string (message ID) or null
    // Both indicate the message was sent successfully
    if (typeof result === 'string' || result === null || result === undefined) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[betNotifications] Message sent successfully', result ? `(ID: ${result})` : '');
      }
      return;
    }
    
    // Unexpected response format
    console.warn('[betNotifications] Unexpected response format:', result);
  } catch (error) {
    console.error('[betNotifications] Failed to send message:', error);
    // Log more details for debugging
    if (error instanceof Error) {
      console.error('[betNotifications] Error details:', {
        message: error.message,
        stack: error.stack,
        experienceId,
        companyId,
      });
    }
  }
}

function formatDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function getEventLabel(bet: IBet): string {
  if (bet.eventName) return bet.eventName;
  if (bet.homeTeam || bet.awayTeam) {
    const away = bet.awayTeam || 'TBD';
    const home = bet.homeTeam || 'TBD';
    return `${away} @ ${home}`;
  }
  return 'Event';
}

function getMarketLabel(bet: IBet): string {
  switch (bet.marketType) {
    case 'ML':
      return bet.selection ? `Moneyline – ${bet.selection}` : 'Moneyline';
    case 'Spread':
      return bet.selection && bet.line !== undefined
        ? `Spread – ${bet.selection} ${bet.line > 0 ? '+' : ''}${bet.line}`
        : 'Spread';
    case 'Total':
      return bet.line !== undefined && bet.overUnder
        ? `Total – ${bet.overUnder} ${bet.line}`
        : 'Total';
    case 'Player Prop':
      return bet.playerName && bet.statType
        ? `Player Prop – ${bet.playerName} ${bet.statType}${bet.line !== undefined ? ` ${bet.overUnder ?? ''} ${bet.line}` : ''}`
        : 'Player Prop';
    case 'Parlay':
      return bet.parlaySummary ? `Parlay – ${bet.parlaySummary}` : 'Parlay';
    default:
      return bet.marketType;
  }
}

function formatOdds(bet: IBet): string {
  if (typeof bet.oddsAmerican === 'number' && !Number.isNaN(bet.oddsAmerican)) {
    const prefix = bet.oddsAmerican > 0 ? '+' : '';
    return `${prefix}${bet.oddsAmerican}`;
  }
  if (typeof bet.odds === 'number' && !Number.isNaN(bet.odds)) {
    return bet.odds.toFixed(2);
  }
  return 'N/A';
}

function formatUnits(units: number): string {
  if (Number.isNaN(units)) return 'N/A units';
  return `${units % 1 === 0 ? units.toFixed(0) : units.toFixed(2)} units`;
}

function formatUser(user?: IUser | null): string {
  if (!user) return 'Unknown bettor';
  return user.alias || user.whopDisplayName || user.whopUsername || user.whopUserId || 'Unknown bettor';
}

export async function notifyBetCreated(bet: IBet, user?: IUser | null): Promise<void> {
  const messageLines = [
    '🆕 **Bet Created**',
    `User: ${formatUser(user)}`,
    `Event: ${getEventLabel(bet)}`,
    `Market: ${getMarketLabel(bet)}`,
    `Stake: ${formatUnits(bet.units)}`,
    `Odds: ${formatOdds(bet)}`,
    `Start: ${formatDate(new Date(bet.startTime))}`,
  ];

  if (bet.book) {
    messageLines.push(`Book: ${bet.book}`);
  }
  if (bet.notes) {
    messageLines.push(`Notes: ${bet.notes}`);
  }
  if (bet.slipImageUrl) {
    messageLines.push(`Slip: ${bet.slipImageUrl}`);
  }

  await sendMessage(messageLines.join('\n'), bet.companyId);
}

export async function notifyBetUpdated(bet: IBet, user?: IUser | null, updatedFields?: Record<string, unknown>): Promise<void> {
  const lines = [
    '✏️ **Bet Updated**',
    `User: ${formatUser(user)}`,
    `Event: ${getEventLabel(bet)}`,
    `Market: ${getMarketLabel(bet)}`,
  ];

  if (updatedFields) {
    const changes = Object.entries(updatedFields)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}: ${value}`);
    if (changes.length > 0) {
      lines.push('Changes:', ...changes.map((line) => `• ${line}`));
    }
  }

  lines.push(`Stake: ${formatUnits(bet.units)}`);
  lines.push(`Odds: ${formatOdds(bet)}`);

  await sendMessage(lines.join('\n'), bet.companyId);
}

export async function notifyBetDeleted(bet: IBet, user?: IUser | null): Promise<void> {
  const message = [
    '🗑️ **Bet Deleted**',
    `User: ${formatUser(user)}`,
    `Event: ${getEventLabel(bet)}`,
    `Market: ${getMarketLabel(bet)}`,
    `Stake: ${formatUnits(bet.units)}`,
    `Odds: ${formatOdds(bet)}`,
  ].join('\n');

  await sendMessage(message, bet.companyId);
}

export async function notifyBetSettled(bet: IBet, result: IBet['result'], user?: IUser | null): Promise<void> {
  const outcomeEmoji: Record<IBet['result'], string> = {
    win: '✅',
    loss: '❌',
    push: '➖',
    void: '⚪',
    pending: '⏳',
  };

  const message = [
    `${outcomeEmoji[result]} **Bet Settled – ${result.toUpperCase()}**`,
    `User: ${formatUser(user)}`,
    `Event: ${getEventLabel(bet)}`,
    `Market: ${getMarketLabel(bet)}`,
    `Stake: ${formatUnits(bet.units)}`,
    `Odds: ${formatOdds(bet)}`,
  ].join('\n');

  await sendMessage(message, bet.companyId);
}


