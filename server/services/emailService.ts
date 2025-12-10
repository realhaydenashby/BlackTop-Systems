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

const EMAIL_STYLES = `
  body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
    line-height: 1.6; 
    color: #e5e5e5; 
    background-color: #0a0a0a;
    max-width: 600px; 
    margin: 0 auto; 
    padding: 40px 20px; 
  }
  .container {
    background: #171717;
    border-radius: 12px;
    padding: 32px;
    border: 1px solid #262626;
  }
  .logo { 
    font-size: 20px; 
    font-weight: 700; 
    color: #ffffff;
    letter-spacing: -0.5px;
    margin-bottom: 24px;
  }
  .header { 
    font-size: 28px; 
    font-weight: 600; 
    color: #ffffff;
    margin-bottom: 16px; 
    line-height: 1.3;
  }
  .subtext {
    color: #a3a3a3;
    font-size: 16px;
    margin-bottom: 24px;
  }
  .content { 
    background: #262626; 
    padding: 24px; 
    border-radius: 8px; 
    margin: 24px 0;
    border: 1px solid #404040;
  }
  .content p {
    margin: 0 0 12px 0;
    color: #d4d4d4;
  }
  .content p:last-child {
    margin-bottom: 0;
  }
  .cta { 
    display: inline-block; 
    background: #ffffff; 
    color: #0a0a0a; 
    padding: 14px 28px; 
    border-radius: 8px; 
    text-decoration: none; 
    font-weight: 600;
    font-size: 15px;
  }
  .footer { 
    font-size: 13px; 
    color: #737373; 
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid #262626;
  }
  a { color: #e5e5e5; }
`;

export async function sendWaitlistWelcomeEmail(email: string, name: string): Promise<boolean> {
  const subject = "You're on the BlackTop waitlist";
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>${EMAIL_STYLES}</style>
    </head>
    <body>
      <div class="container">
        <div class="logo">BlackTop</div>
        
        <div class="header">Welcome, ${name}</div>
        
        <p class="subtext">You're on the list. We'll notify you when it's your turn.</p>
        
        <div class="content">
          <p><strong style="color: #ffffff;">BlackTop is a financial autopilot for startups.</strong></p>
          <p>Connect your bank or accounting software and get instant clarity on runway, burn rate, and what actually matters — without spreadsheets or consultants.</p>
        </div>
        
        <p style="margin: 24px 0;">
          <a href="https://blacktop.systems/dashboard" class="cta">Explore the Demo</a>
        </p>
        
        <div class="footer">
          <p>Questions? Reply to this email.</p>
          <p style="margin-top: 8px;">— The BlackTop Team</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  return sendEmail(email, subject, htmlBody);
}

export async function sendApprovalEmail(email: string, name: string): Promise<boolean> {
  const subject = "You're in — BlackTop access granted";
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>${EMAIL_STYLES}</style>
    </head>
    <body>
      <div class="container">
        <div class="logo">BlackTop</div>
        
        <div class="header">You're approved, ${name}</div>
        
        <p class="subtext">Your account is ready. Log in now to connect your financial data and get instant clarity on your startup's finances.</p>
        
        <div class="content">
          <p><strong style="color: #ffffff;">What happens next:</strong></p>
          <p>1. Connect your bank accounts or QuickBooks in 60 seconds</p>
          <p>2. See your burn rate, runway, and cash flow instantly</p>
          <p>3. Get AI-powered insights on what to watch</p>
        </div>
        
        <p style="margin: 24px 0;">
          <a href="https://blacktop.systems/api/login" class="cta">Log In to BlackTop</a>
        </p>
        
        <div class="footer">
          <p>Need help? Reply to this email and we'll get you sorted.</p>
          <p style="margin-top: 8px;">— The BlackTop Team</p>
        </div>
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
      <style>${EMAIL_STYLES}</style>
    </head>
    <body>
      <div class="container">
        <div class="logo">BlackTop Admin</div>
        
        <div class="header">New Signup</div>
        
        <div class="content">
          <p><strong style="color: #ffffff;">Name:</strong> ${entry.name}</p>
          <p><strong style="color: #ffffff;">Email:</strong> ${entry.email}</p>
          <p><strong style="color: #ffffff;">Role:</strong> ${entry.role || 'Not specified'}</p>
          ${entry.company ? `<p><strong style="color: #ffffff;">Company:</strong> ${entry.company}</p>` : ''}
          ${entry.painPoint ? `<p><strong style="color: #ffffff;">Pain Point:</strong> ${entry.painPoint}</p>` : ''}
        </div>
        
        <p style="margin: 24px 0;">
          <a href="https://blacktop.systems/admin/waitlist" class="cta">Approve in Admin Panel</a>
        </p>
      </div>
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
