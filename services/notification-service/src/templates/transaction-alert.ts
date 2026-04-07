import type { Transaction } from '../../../../packages/common/src/types';
import { formatCurrency, maskAccountNumber } from '../../../../packages/common/src/utils';

// BUG (Issue #14): These templates don't escape HTML in dynamic content
// XSS vulnerability when rendering in email

export function buildTransactionAlertSubject(transaction: Transaction): string {
  const typeLabels: Record<string, string> = {
    deposit: 'Deposit Received',
    withdrawal: 'Withdrawal Processed',
    transfer: 'Transfer Completed',
    payment: 'Payment Processed',
    refund: 'Refund Issued',
  };

  return `FinServCo Alert: ${typeLabels[transaction.type] || 'Transaction Update'}`;
}

export function buildTransactionAlertBody(transaction: Transaction): string {
  const formattedAmount = formatCurrency(transaction.amount, transaction.currency);

  // BUG (Issue #14): description is user-provided and not escaped
  return `
    <h3>Transaction ${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Transaction ID</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${transaction.id}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${formattedAmount}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Status</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${transaction.status}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Description</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${transaction.description}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Reference</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${transaction.reference}</td>
      </tr>
    </table>
    <p style="margin-top: 16px; font-size: 12px; color: #666;">
      If you did not authorize this transaction, please contact FinServCo support immediately.
    </p>
  `;
}

export function buildLargeTransactionAlert(transaction: Transaction): string {
  const formattedAmount = formatCurrency(transaction.amount, transaction.currency);

  return `
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 16px; border-radius: 4px;">
      <h3 style="color: #856404;">⚠️ Large Transaction Alert</h3>
      <p>A transaction of <strong>${formattedAmount}</strong> has been processed on your account.</p>
      <p>Transaction ID: ${transaction.id}</p>
      <p>If you did not authorize this transaction, please contact us immediately at 1-800-FINSERV.</p>
    </div>
  `;
}
