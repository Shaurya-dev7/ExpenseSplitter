import ExpenseApp from './components/ExpenseApp'
import './styles/fairshare.css'
import './styles/accounts.css'
import { AuthProvider } from './contexts/AuthContext'

export default function App() {
  return <AuthProvider><ExpenseApp /></AuthProvider>
}
