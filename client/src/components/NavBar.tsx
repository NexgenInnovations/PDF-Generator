
import { Link } from 'react-router-dom';
import { useRole } from '../context/RoleContext.js';
import type { Role } from '../types.js';

const ROLES: Role[] = ['Admin', 'Designer', 'FormFiller'];

export function NavBar() {
  const { role, setRole } = useRole();

  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px', borderBottom: '1px solid #e0e0e0', background: '#fff' }}>
      <Link to="/" style={{ fontWeight: 700, fontSize: 18, textDecoration: 'none', color: '#1a1a1a' }}>
        PDF Manager
      </Link>
      <span style={{ flex: 1 }} />
      <label htmlFor="role-select" style={{ fontWeight: 600, fontSize: 14 }}>Role:</label>
      <select
        id="role-select"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </nav>
  );
}
