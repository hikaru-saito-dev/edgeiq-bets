import { Bet } from '@/models/Bet';
import type { IBet } from '@/models/Bet';
import type { IUser } from '@/models/User';
import { User } from '@/models/User';
import connectDB from '@/lib/db';

/**
 * Check if a webhook URL supports embeds (Discord and Whop both support embeds)
 */
function supportsEmbeds(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // Both Discord and Whop webhooks support embeds
    return urlObj.hostname.includes('discord.com') || 
           urlObj.hostname.includes('discordapp.com') ||
           urlObj.hostname.includes('whop.com');
  } catch {
    return false;
  }
}

/**
 * Format date to Discord timestamp format in EST/New York timezone
 * Discord timestamps use UTC Unix timestamps, but we convert the date to EST first
 * to ensure the displayed time matches EST/New York timezone
 */
function formatDiscordTimestamp(date: Date | string | number): string {
  try {
    const dateObj = typeof date === 'string' || typeof date === 'number' 
      ? new Date(date) 
      : date;
    
    // Get the date/time in EST/New York timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(dateObj);
    const year = parseInt(parts.find(p => p.type === 'year')?.value || '0', 10);
    const month = parseInt(parts.find(p => p.type === 'month')?.value || '0', 10) - 1;
    const day = parseInt(parts.find(p => p.type === 'day')?.value || '0', 10);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const second = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);
    
    // Create a UTC date from the EST components
    // This ensures Discord displays the correct EST time
    const estAsUTC = new Date(Date.UTC(year, month, day, hour, minute, second));
    
    // Get Unix timestamp (seconds)
    const unixTimestamp = Math.floor(estAsUTC.getTime() / 1000);
    
    // Discord timestamp format: <t:UNIX_TIMESTAMP:f>
    return `<t:${unixTimestamp}:f>`;
  } catch {
    // Fallback: use the original date's Unix timestamp
    try {
      const dateObj = typeof date === 'string' || typeof date === 'number' 
        ? new Date(date) 
        : date;
      const unixTimestamp = Math.floor(dateObj.getTime() / 1000);
      return `<t:${unixTimestamp}:f>`;
    } catch {
      return '';
    }
  }
}

/**
 * Parse message text into Discord embed structure
 */
function parseMessageToEmbed(message: string, startTime?: Date | string | number): {
  title: string;
  description?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  color?: number;
  footer?: { text: string };
} | null {
  const lines = message.split('\n').filter(line => line.trim());
  if (lines.length === 0) return null;

  // Extract title (first line with emoji and bold)
  const titleLine = lines[0];
  const titleMatch = titleLine.match(/^([🆕✏️🗑️✅❌➖⚪⏳])\s*\*\*(.+?)\*\*/);
  const title = titleMatch ? titleMatch[2] : titleLine.replace(/\*\*/g, '').trim();
  
  // Determine color based on emoji/type
  let color: number | undefined;
  if (titleLine.includes('🆕')) color = 0x6366f1; // Indigo for new
  else if (titleLine.includes('✏️')) color = 0xf59e0b; // Amber for update
  else if (titleLine.includes('🗑️')) color = 0xef4444; // Red for delete
  else if (titleLine.includes('✅')) color = 0x10b981; // Green for win
  else if (titleLine.includes('❌')) color = 0xef4444; // Red for loss
  else if (titleLine.includes('➖')) color = 0x6b7280; // Gray for push
  else if (titleLine.includes('⚪')) color = 0x9ca3af; // Light gray for void
  else color = 0x6366f1; // Default indigo

  // Parse fields from remaining lines
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  let currentSection: string | null = null;
  let currentSectionLines: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check if this is a section header (ends with colon, no value after it, and next line is likely a bullet)
    // Section headers like "Parlay Legs:" or "Changes:" are followed by bullet points
    const isSectionHeader = line.endsWith(':') && 
      (line.split(':').length === 2) && 
      (i + 1 < lines.length && lines[i + 1]?.trim().startsWith('•'));
    
    if (isSectionHeader) {
      // Save previous section if exists
      if (currentSection && currentSectionLines.length > 0) {
        fields.push({
          name: currentSection,
          value: currentSectionLines.join('\n'),
          inline: false,
        });
      }
      currentSection = line.slice(0, -1).trim(); // Remove colon
      currentSectionLines = [];
      continue;
    }

    // Check if this is a key-value pair (contains ": " but not a bullet)
    const kvMatch = line.match(/^([^:•]+?):\s*(.+)$/);
    if (kvMatch && !line.startsWith('•')) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      
      // Special handling for certain fields
      if (key === 'User' || key === 'Event' || key === 'Market') {
        fields.push({
          name: key,
          value: value.replace(/\*\*/g, ''),
          inline: key !== 'Event' && key !== 'Market',
        });
      } else if (key === 'Stake' || key === 'Odds' || key === 'Start' || key === 'Book') {
        fields.push({
          name: key,
          value: value.replace(/\*\*/g, ''),
          inline: true,
        });
      } else if (key.startsWith('Units') || key.startsWith('Total Units')) {
        fields.push({
          name: key,
          value: value.replace(/\*\*/g, ''),
          inline: true,
        });
      } else if (key === 'Notes') {
        fields.push({
          name: key,
          value: value.replace(/\*\*/g, ''),
          inline: false,
        });
      } else if (key === 'Slip') {
        // Skip slip URL as field, will be in description if needed
        continue;
      } else {
        fields.push({
          name: key,
          value: value.replace(/\*\*/g, ''),
          inline: false,
        });
      }
    } else if (line.startsWith('•')) {
      // Bullet point - add to current section or create new field
      const cleanLine = line.replace(/^•\s*/, '').replace(/\*\*/g, '');
      if (currentSection) {
        currentSectionLines.push(cleanLine);
      } else {
        // Create a field for this bullet
        fields.push({
          name: '\u200b', // Zero-width space
          value: cleanLine,
          inline: false,
        });
      }
    } else {
      // Regular text line
      if (currentSection) {
        currentSectionLines.push(line.replace(/\*\*/g, ''));
      } else {
        fields.push({
          name: '\u200b',
          value: line.replace(/\*\*/g, ''),
          inline: false,
        });
      }
    }
  }

  // Save last section if exists
  if (currentSection && currentSectionLines.length > 0) {
    fields.push({
      name: currentSection,
      value: currentSectionLines.join('\n'),
      inline: false,
    });
  }

  // Extract timestamp from "Start:" field if exists
  let footer: { text: string } | undefined;
  const startField = fields.find(f => f.name === 'Start');
  if (startField || startTime) {
    if (startTime) {
      // Use provided startTime and format as Discord timestamp
      const discordTimestamp = formatDiscordTimestamp(startTime);
      footer = { text: `Start: ${discordTimestamp}` };
    } else if (startField) {
      // Fallback to field value if no startTime provided
      footer = { text: `Start: ${startField.value}` };
    }
  }

  const result: {
    title: string;
    description?: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    color?: number;
    footer?: { text: string };
  } = {
    title,
    color,
  };

  if (fields.length === 0) {
    result.description = message.replace(/\*\*/g, '');
  } else {
    result.fields = fields;
  }

  if (footer) {
    result.footer = footer;
  }

  return result;
}

/**
 * Send message via webhook (works for both Discord and Whop webhooks)
 * Both Discord and Whop webhooks support embeds
 * 
 * @param message - The message content to send
 * @param webhookUrl - The webhook URL (Discord or Whop)
 * @param startTime - Optional start time for Discord timestamp formatting
 * @returns Promise that resolves when message is sent (or fails silently)
 */
async function sendWebhookMessage(message: string, webhookUrl: string, startTime?: Date | string | number): Promise<void> {
  if (!webhookUrl || !message.trim()) {
    return;
  }

  try {
    const useEmbeds = supportsEmbeds(webhookUrl);
    
    let payload: { content?: string; embeds?: Array<unknown> };
    
    if (useEmbeds) {
      // Parse message into embed format (works for both Discord and Whop)
      const embed = parseMessageToEmbed(message, startTime);
      
      if (embed) {
        const embedPayload: {
          title: string;
          description?: string;
          fields?: Array<{ name: string; value: string; inline?: boolean }>;
          color?: number;
          footer?: { text: string };
          timestamp: string;
        } = {
          title: embed.title,
          timestamp: new Date().toISOString(),
        };

        if (embed.description) {
          embedPayload.description = embed.description;
        }
        if (embed.fields && embed.fields.length > 0) {
          embedPayload.fields = embed.fields;
        }
        if (embed.color) {
          embedPayload.color = embed.color;
        }
        if (embed.footer) {
          embedPayload.footer = embed.footer;
        }

        payload = {
          embeds: [embedPayload],
        };
      } else {
        // Fallback to plain text if parsing fails
        payload = { content: message };
      }
    } else {
      // Unknown webhook type - use plain text
      payload = { content: message };
    }

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
 * Main send message function - sends to all owner/admin webhooks for the company
 * 
 * @param message - The formatted message to send
 * @param companyId - Company ID to find owners/admins
 * @param startTime - Optional start time for Discord timestamp formatting
 */
async function sendMessage(message: string, companyId?: string, startTime?: Date | string | number): Promise<void> {
  if (!companyId) return;

  try {
    await connectDB();
    
    // Find all owners and admins for this company
    const ownersAndAdmins = await User.find({
      companyId,
      role: { $in: ['owner', 'admin'] },
    })
      .select('whopWebhookUrl discordWebhookUrl')
      .lean();

    // Build array of webhook promises to send to
    const webhookPromises: Promise<void>[] = [];

    for (const user of ownersAndAdmins) {
      if (user.discordWebhookUrl) {
        webhookPromises.push(sendWebhookMessage(message, user.discordWebhookUrl, startTime));
      }
      if (user.whopWebhookUrl) {
        webhookPromises.push(sendWebhookMessage(message, user.whopWebhookUrl, startTime));
      }
    }

    // Send to all configured webhooks in parallel
    // Use Promise.allSettled so if one fails, the others still work
    if (webhookPromises.length > 0) {
      await Promise.allSettled(webhookPromises);
    }
  } catch (error) {
    // Silently fail to prevent breaking bet operations
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

function formatParlayLegMarket(leg: IBet): string {
  switch (leg.marketType) {
    case 'ML':
      return leg.selection ? `Moneyline – ${leg.selection}` : 'Moneyline';
    case 'Spread':
      return leg.selection && leg.line !== undefined
        ? `Spread – ${leg.selection} ${leg.line > 0 ? '+' : ''}${leg.line}`
        : 'Spread';
    case 'Total':
      return leg.line !== undefined && leg.overUnder
        ? `Total – ${leg.overUnder} ${leg.line}`
        : 'Total';
    case 'Player Prop':
      return leg.playerName && leg.statType
        ? `Player Prop – ${leg.playerName} ${leg.statType}${leg.line !== undefined ? ` ${leg.overUnder ?? ''} ${leg.line}` : ''}`
        : 'Player Prop';
    default:
      return leg.marketType;
  }
}

async function getParlayLegDetails(bet: IBet): Promise<string[]> {
  const id = typeof bet._id === 'string' ? bet._id : bet._id?.toString?.();
  if (!id) return [];

  try {
    const legDocs = await Bet.find({ parlayId: id })
      .sort({ startTime: 1 })
      .lean();

    return (legDocs as unknown as IBet[]).map((leg, index) => {
      const event = getEventLabel(leg);
      const market = formatParlayLegMarket(leg);
      const start = leg.startTime ? ` – ${formatDate(new Date(leg.startTime))}` : '';
      return `Leg ${index + 1}: ${event}${start}\n    ${market}`;
    });
  } catch (error) {
    console.error('Error fetching parlay legs for notifications:', error);
    return [];
  }
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

  if (bet.marketType === 'Parlay') {
    const legDetails = await getParlayLegDetails(bet);
    if (legDetails.length > 0) {
      messageLines.push('Parlay Legs:', ...legDetails.map((line) => `• ${line}`));
    }
  }

  await sendMessage(messageLines.join('\n'), finalCompanyId, bet.startTime);
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

  if (bet.marketType === 'Parlay') {
    const legDetails = await getParlayLegDetails(bet);
    if (legDetails.length > 0) {
      lines.push('Legs:', ...legDetails.map((line) => `• ${line}`));
    }
  }

  await sendMessage(lines.join('\n'), companyId, bet.startTime);
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

  await sendMessage(message, companyId, bet.startTime);
}

export async function notifyBetSettled(bet: IBet, result: IBet['result'], user?: IUser | null): Promise<void> {
  const companyId = bet.companyId || (user?.companyId as string | undefined);
  if (!companyId) return;

  // Check if user wants settlement notifications
  let userForCheck = user;
  if (!userForCheck && bet.userId) {
    try {
      await connectDB();
      const { User } = await import('@/models/User');
      userForCheck = await User.findById(bet.userId).lean() as unknown as IUser | null;
    } catch {
      // If we can't fetch user, continue without checking preference
    }
  }

  // Only send if user has notifyOnSettlement enabled
  if (!userForCheck?.notifyOnSettlement) {
    return;
  }

  const outcomeEmoji: Record<IBet['result'], string> = {
    win: '✅',
    loss: '❌',
    push: '➖',
    void: '⚪',
    pending: '⏳',
  };

  // Calculate units won/lost for this bet
  let unitsWonLost = 0;
  if (result === 'win') {
    unitsWonLost = bet.units * (bet.odds - 1);
  } else if (result === 'loss') {
    unitsWonLost = -bet.units;
  } else if (result === 'push' || result === 'void') {
    unitsWonLost = 0;
  }

  // Calculate total units from all settled bets
  let totalUnits = 0;
  try {
    await connectDB();
    const { Bet } = await import('@/models/Bet');
    const allBets = await Bet.find({ 
      userId: bet.userId,
      result: { $in: ['win', 'loss', 'push', 'void'] },
    }).lean() as unknown as IBet[];

    allBets.forEach((b) => {
      if (b.result === 'void' || b.result === 'push') return;
      if (b.result === 'win') {
        totalUnits += b.units * (b.odds - 1);
      } else if (b.result === 'loss') {
        totalUnits -= b.units;
      }
    });
  } catch {
    // If calculation fails, continue without total units
  }

  const messageLines = [
    `${outcomeEmoji[result]} **Bet Settled – ${result.toUpperCase()}**`,
    `User: ${formatUser(userForCheck)}`,
    `Event: ${getEventLabel(bet)}`,
    `Market: ${getMarketLabel(bet)}`,
    `Stake: ${formatUnits(bet.units)}`,
    `Odds: ${formatOdds(bet)}`,
    `Units ${result === 'win' ? 'Won' : result === 'loss' ? 'Lost' : 'Result'}: ${unitsWonLost >= 0 ? '+' : ''}${formatUnits(unitsWonLost)}`,
    `Total Units (All Time): ${totalUnits >= 0 ? '+' : ''}${formatUnits(totalUnits)}`,
  ];

  if (bet.marketType === 'Parlay') {
    const legDetails = await getParlayLegDetails(bet);
    if (legDetails.length > 0) {
      messageLines.push('Legs:', ...legDetails.map((line) => `• ${line}`));
    }
  }

  const message = messageLines.join('\n');

  // Send to user's webhooks if they have notifyOnSettlement enabled
  const webhookPromises: Promise<void>[] = [];
  if (userForCheck.discordWebhookUrl) {
    webhookPromises.push(sendWebhookMessage(message, userForCheck.discordWebhookUrl, bet.startTime));
  }
  if (userForCheck.whopWebhookUrl) {
    webhookPromises.push(sendWebhookMessage(message, userForCheck.whopWebhookUrl, bet.startTime));
  }

  // Send to all configured webhooks in parallel
  if (webhookPromises.length > 0) {
    await Promise.allSettled(webhookPromises);
  }
}



