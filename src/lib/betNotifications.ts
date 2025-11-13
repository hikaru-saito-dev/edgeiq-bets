import type { IBet } from '@/models/Bet';
import type { IUser } from '@/models/User';

// Environment variables
const DISCORD_WEBHOOK_URL_ENV_KEY = 'DISCORD_WEBHOOK_URL';
const WHOP_WEBHOOK_URL_ENV_KEY = 'WHOP_WEBHOOK_URL';

function getDiscordWebhookUrl(): string | null {
  return process.env[DISCORD_WEBHOOK_URL_ENV_KEY] || null;
}

function getWhopWebhookUrl(): string | null {
  return process.env[WHOP_WEBHOOK_URL_ENV_KEY] || null;
}

/**
 * Send message via webhook (works for both Discord and Whop webhooks)
 * Whop chat webhooks are compatible with Discord's webhook API
 * 
 * @param message - The message content to send
 * @param webhookUrl - The webhook URL (Discord or Whop)
 * @returns Promise that resolves when message is sent (or fails silently)
 */
async function sendWebhookMessage(message: string, webhookUrl: string): Promise<void> {
  if (!webhookUrl || !message.trim()) {
    return;
  }

  try {
    // Both Discord and Whop webhooks support the same format
    // Discord/Whop support **bold**, *italic*, etc.
    // No need to modify the message - webhooks handle markdown natively
    const payload = {
      content: message,
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Discord returns 200/204, Whop returns 200/204 for success
    // 204 No Content is also a success response
    if (response.ok || response.status === 204) {
      // Success - message sent
      return;
    }
    
    // Non-2xx response - log but don't throw (don't interrupt bet operations)
    // Silently fail to prevent breaking bet creation/updates
  } catch (error) {
    // Network error or exception - silently fail
    // Don't log to avoid cluttering logs with webhook failures
  }
}


/**
 * Main send message function - sends to both Discord and Whop webhooks simultaneously
 * if both are configured. If only one is configured, sends to that one only.
 * 
 * Webhook methods don't require companyId, but it's kept in the signature
 * for compatibility with existing notification function calls.
 * 
 * @param message - The formatted message to send
 * @param companyId - Optional (not used for webhook methods, kept for compatibility)
 */
async function sendMessage(message: string, companyId?: string): Promise<void> {
  const discordUrl = getDiscordWebhookUrl();
  const whopUrl = getWhopWebhookUrl();
  
  // Build array of webhook promises to send to
  const webhookPromises: Promise<void>[] = [];
  
  if (discordUrl) {
    webhookPromises.push(sendWebhookMessage(message, discordUrl));
  }
  
  if (whopUrl) {
    webhookPromises.push(sendWebhookMessage(message, whopUrl));
  }
  
  // Send to all configured webhooks in parallel
  // Use Promise.allSettled so if one fails, the other still works
  if (webhookPromises.length > 0) {
    await Promise.allSettled(webhookPromises);
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
    case 'Parlay': {
      const summaryUnknown = bet.parlaySummary as unknown;
      if (typeof summaryUnknown === 'string' && summaryUnknown.trim()) {
        return `Parlay – ${summaryUnknown}`;
      }
      if (Array.isArray(summaryUnknown)) {
        const joined = summaryUnknown
          .map((item) => (typeof item === 'string' ? item : typeof item === 'object' && item ? Object.values(item).join(' ') : String(item)))
          .filter((item) => Boolean(item))
          .join(' + ');
        if (joined) return `Parlay – ${joined}`;
      }
      if (summaryUnknown && typeof summaryUnknown === 'object') {
        const joined = Object.values(summaryUnknown as Record<string, unknown>)
          .map((item) => (typeof item === 'string' ? item : String(item)))
          .filter((item) => Boolean(item))
          .join(' + ');
        if (joined) return `Parlay – ${joined}`;
      }
      return 'Parlay';
    }
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

export async function notifyBetCreated(bet: IBet, user?: IUser | null, companyId?: string): Promise<void> {
  const finalCompanyId = companyId || (user?.companyId as string | undefined) || bet.companyId;
  if (!finalCompanyId) return;

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

  await sendMessage(messageLines.join('\n'), finalCompanyId);
}

export async function notifyBetUpdated(bet: IBet, user?: IUser | null, updatedFields?: Record<string, unknown>): Promise<void> {
  const companyId = bet.companyId || (user?.companyId as string | undefined);
  if (!companyId) return;

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

  await sendMessage(lines.join('\n'), companyId);
}

export async function notifyBetDeleted(bet: IBet, user?: IUser | null): Promise<void> {
  const companyId = bet.companyId || (user?.companyId as string | undefined);
  if (!companyId) return;

  const message = [
    '🗑️ **Bet Deleted**',
    `User: ${formatUser(user)}`,
    `Event: ${getEventLabel(bet)}`,
    `Market: ${getMarketLabel(bet)}`,
    `Stake: ${formatUnits(bet.units)}`,
    `Odds: ${formatOdds(bet)}`,
  ].join('\n');

  await sendMessage(message, companyId);
}

export async function notifyBetSettled(bet: IBet, result: IBet['result'], user?: IUser | null): Promise<void> {
  const companyId = bet.companyId || (user?.companyId as string | undefined);
  if (!companyId) return;

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

  await sendMessage(message, companyId);
}


