// Email service using Gmail integration (connection:conn_google-mail_01KAJRWV6MZB3JAPBCNDVZX9DC)
import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function createEmailMessage(to: string, subject: string, htmlBody: string, fromName: string = "BlackTop Systems"): string {
  const messageParts = [
    `From: ${fromName} <me>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody
  ];
  
  const message = messageParts.join('\r\n');
  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendEmail(to: string, subject: string, htmlBody: string): Promise<boolean> {
  try {
    const gmail = await getGmailClient();
    const encodedMessage = createEmailMessage(to, subject, htmlBody);
    
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });
    
    console.log(`[EMAIL] Sent email to ${to}: ${subject}`);
    return true;
  } catch (error: any) {
    console.error(`[EMAIL] Failed to send email to ${to}:`, error.message);
    return false;
  }
}

const ADMIN_EMAILS = ["ashby.hayden8@gmail.com", "williamsyring@gmail.com"];

export async function sendWaitlistWelcomeEmail(email: string, name: string): Promise<boolean> {
  const subject = "Welcome to the BlackTop Waitlist!";
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { font-size: 24px; font-weight: 600; margin-bottom: 20px; }
        .content { background: #f8f9fa; padding: 24px; border-radius: 8px; margin: 20px 0; }
        .footer { font-size: 14px; color: #666; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="header">Welcome to BlackTop, ${name}!</div>
      
      <p>You're on the list.</p>
      
      <div class="content">
        <p><strong>BlackTop gives tech startups instant financial clarity</strong> — runway forecasts, burn tracking, and AI-powered insights — without the spreadsheets, consultants, or learning curve.</p>
        
        <p>Just connect your bank or accounting software and we handle the rest. Zero setup time, zero overhead.</p>
      </div>
      
      <p>We'll reach out soon with early access. In the meantime, feel free to explore our <a href="https://blacktop.systems/dashboard">demo dashboard</a> to see what's coming.</p>
      
      <div class="footer">
        <p>— The BlackTop Team</p>
      </div>
    </body>
    </html>
  `;
  
  return sendEmail(email, subject, htmlBody);
}

export async function sendWaitlistAdminNotification(entry: {
  email: string;
  name: string;
  role?: string;
  company?: string | null;
  painPoint?: string | null;
}): Promise<boolean> {
  const subject = `New Waitlist Signup: ${entry.name}`;
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { font-size: 20px; font-weight: 600; margin-bottom: 20px; }
        .details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 16px 0; }
        .label { font-weight: 600; color: #666; font-size: 12px; text-transform: uppercase; }
        .value { font-size: 16px; margin-bottom: 12px; }
        .cta { display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px; }
      </style>
    </head>
    <body>
      <div class="header">New Waitlist Signup</div>
      
      <div class="details">
        <div class="label">Name</div>
        <div class="value">${entry.name}</div>
        
        <div class="label">Email</div>
        <div class="value">${entry.email}</div>
        
        <div class="label">Role</div>
        <div class="value">${entry.role || 'Not specified'}</div>
        
        ${entry.company ? `
        <div class="label">Company</div>
        <div class="value">${entry.company}</div>
        ` : ''}
        
        ${entry.painPoint ? `
        <div class="label">Pain Point</div>
        <div class="value">${entry.painPoint}</div>
        ` : ''}
      </div>
      
      <a href="https://blacktop.systems/admin/waitlist" class="cta">View in Admin Panel</a>
    </body>
    </html>
  `;
  
  let success = true;
  for (const adminEmail of ADMIN_EMAILS) {
    const sent = await sendEmail(adminEmail, subject, htmlBody);
    if (!sent) success = false;
  }
  
  return success;
}
