import './assets/main.css'

import { createRoot } from 'react-dom/client'
import App from './App'
import { BgSetter } from './windows/BgSetter'

const params = new URLSearchParams(window.location.search)
const isBgSetter = params.get('bgsetter') === '1'

createRoot(document.getElementById('root')!).render(isBgSetter ? <BgSetter /> : <App />)
