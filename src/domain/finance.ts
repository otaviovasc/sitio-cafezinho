export function summarizeRegisteredCash(
  revenues: Array<{ status: string; amount: string | number }>,
  purchases: Array<{ status: string; totalAmount: string | number }>,
) {
  const received = revenues.filter((row) => row.status === 'RECEIVED').reduce((sum, row) => sum + Number(row.amount), 0);
  const expected = revenues.filter((row) => row.status === 'EXPECTED').reduce((sum, row) => sum + Number(row.amount), 0);
  const paid = purchases.filter((row) => row.status === 'PAID').reduce((sum, row) => sum + Number(row.totalAmount), 0);
  const open = purchases.filter((row) => row.status === 'OPEN').reduce((sum, row) => sum + Number(row.totalAmount), 0);
  return {
    received: Math.round(received * 100) / 100,
    expected: Math.round(expected * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    open: Math.round(open * 100) / 100,
    cashResult: Math.round((received - paid) * 100) / 100,
  };
}
