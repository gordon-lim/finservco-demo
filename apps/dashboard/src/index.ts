import express from 'express';
import path from 'path';
import { createLogger } from '../../../packages/logger/src';
import { apiRouter } from './pages/api';

const app = express();
const logger = createLogger('dashboard');
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/dashboard', apiRouter);

// Serve the main dashboard page
app.get('/', (_req, res) => {
  res.send(getDashboardHtml());
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'dashboard' });
});

// MISSING FEATURE (Issue #19): No graceful shutdown
const server = app.listen(PORT, () => {
  logger.info(`Dashboard listening on port ${PORT}`);
});

function getDashboardHtml(): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>FinServCo - Admin Dashboard</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; }
        .header { background: #1a365d; color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 20px; }
        .nav { display: flex; gap: 16px; }
        .nav a { color: #90cdf4; text-decoration: none; font-size: 14px; }
        .nav a:hover { color: white; }
        .container { max-width: 1200px; margin: 24px auto; padding: 0 24px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 24px; }
        .card { background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .card h3 { font-size: 14px; color: #718096; margin-bottom: 8px; }
        .card .value { font-size: 32px; font-weight: bold; color: #1a365d; }
        .card .change { font-size: 12px; margin-top: 4px; }
        .card .change.positive { color: #38a169; }
        .card .change.negative { color: #e53e3e; }
        .table-card { grid-column: 1 / -1; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e2e8f0; }
        th { font-size: 12px; color: #718096; text-transform: uppercase; }
        .status { padding: 2px 8px; border-radius: 12px; font-size: 12px; }
        .status.active { background: #c6f6d5; color: #22543d; }
        .status.pending { background: #fefcbf; color: #744210; }
        .status.failed { background: #fed7d7; color: #742a2a; }
        .status.suspended { background: #e2e8f0; color: #4a5568; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>FinServCo Dashboard</h1>
        <div class="nav">
          <a href="/">Overview</a>
          <a href="/accounts">Accounts</a>
          <a href="/transactions">Transactions</a>
          <a href="/risk">Risk Monitor</a>
          <a href="/notifications">Notifications</a>
        </div>
      </div>
      <div class="container">
        <div class="grid">
          <div class="card">
            <h3>Total Accounts</h3>
            <div class="value" id="total-accounts">--</div>
            <div class="change positive">+12 this month</div>
          </div>
          <div class="card">
            <h3>Active Transactions</h3>
            <div class="value" id="active-transactions">--</div>
            <div class="change positive">+340 today</div>
          </div>
          <div class="card">
            <h3>Risk Alerts</h3>
            <div class="value" id="risk-alerts">--</div>
            <div class="change negative">+3 flagged</div>
          </div>
          <div class="card">
            <h3>Total Volume (24h)</h3>
            <div class="value" id="total-volume">--</div>
            <div class="change positive">+8.2% vs yesterday</div>
          </div>
        </div>
        <div class="grid">
          <div class="card table-card">
            <h3>Recent Transactions</h3>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody id="recent-transactions">
                <tr><td colspan="5">Loading...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <script>
        // Dashboard would fetch data from the API
        // For demo purposes, using placeholder data
        document.getElementById('total-accounts').textContent = '4,283';
        document.getElementById('active-transactions').textContent = '1,247';
        document.getElementById('risk-alerts').textContent = '17';
        document.getElementById('total-volume').textContent = '$2.4M';
      </script>
    </body>
    </html>
  `;
}

export { app, server };
