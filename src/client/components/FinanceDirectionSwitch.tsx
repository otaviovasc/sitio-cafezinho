import { CircleDollarSign, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';

export function FinanceDirectionSwitch({ active }: { active: 'income' | 'expense' }) {
  return <nav className="finance-direction-switch" aria-label="Tipo de lançamento financeiro">
    <Link
      className={`finance-direction-option ${active === 'income' ? 'finance-direction-option-active finance-direction-income' : ''}`}
      to="/receitas/nova"
      aria-current={active === 'income' ? 'page' : undefined}
    >
      <CircleDollarSign size={22} aria-hidden />
      <span><strong>Entrada</strong><small>Venda ou receita</small></span>
    </Link>
    <Link
      className={`finance-direction-option ${active === 'expense' ? 'finance-direction-option-active finance-direction-expense' : ''}`}
      to="/compras/nova"
      aria-current={active === 'expense' ? 'page' : undefined}
    >
      <ShoppingCart size={22} aria-hidden />
      <span><strong>Saída</strong><small>Compra ou despesa</small></span>
    </Link>
  </nav>;
}
