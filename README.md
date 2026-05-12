# 🤖 AI-Powered Self-Healing Test Automation Framework

A production-grade Playwright + TypeScript test automation framework with **9-layer self-healing cascade**, live dashboard, and AI-powered locator recovery.

---

## ✨ Features

- **9-Layer Self-Healing** — automatically recovers from locator failures
- **Semantic Synonym Healing** — finds renamed elements by meaning (Cancel→Reset, Submit→Save)
- **Learning DB** — stores verified fixes, reuses them in 2ms on next run
- **LLM Integration** — local Ollama AI for intelligent failure analysis
- **Live Dashboard** — real-time test results at `http://localhost:3000`
- **PreFlightCheck** — auto-repairs environment before tests run
- **Cross-browser** — Chrome, Firefox, Safari
- **CI/CD Ready** — GitHub Actions pipeline included
- **Docker Support** — ParaBank + The Internet run locally

---

## 🏗️ 9 Healing Layers

| Layer | Name | Speed |
|-------|------|-------|
| Layer 0 | NavigationGuard — retry + blank page detection | 0ms |
| Layer 1 | Direct execution with retry + backoff | 2ms |
| Layer 2 | SmartLocator — 30+ confidence-scored strategies | 10ms |
| Layer 3 | Learning DB — previously verified fixes | 2ms |
| Layer 3.5 | LLM label prediction — no DOM needed | 50ms |
| Layer 4 | DOM capture + self-heal candidates | 200ms |
| Layer 5 | Ollama LLM — full DOM analysis | 2s |
| Layer 6 | Autonomous Diagnostics — no AI needed | 500ms |
| Layer 7 | Semantic Synonym Healing | 100ms |

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Copy environment file
cp .env.example .env

# Run tests
npm test

# Start live dashboard
npm run dashboard:server
```

---

## 🐳 Docker Setup

```bash
# Start ParaBank + The Internet locally
npm run docker:up

# Run tests against local Docker
BASE_URL=http://localhost:7080 npm test
```

---

## 📊 Live Dashboard

```bash
npm run dashboard:server
# Open http://localhost:3000
```

Role-based access via token:
```
http://localhost:3000?token=admin-token   → Admin view
http://localhost:3000?token=qa-token      → QA view
http://localhost:3000?token=mgr-token     → Manager view
http://localhost:3000                     → Public view
```

---

## 🧠 LLM Setup (Optional)

```bash
# Install Ollama
# https://ollama.com

# Pull model
ollama pull llama3

# Enable in .env
FW_LLM=true
```

---

## ⚙️ Environment Variables

```env
BASE_URL=https://the-internet.herokuapp.com
APP_USERNAME=your-username
APP_PASSWORD=your-password
HEADLESS=true
FW_LLM=false
FW_LLM_MODEL=llama3
```

---

## 📁 Project Structure

```
src/
├── core/          # Runner + WorkflowRunner (9-layer orchestration)
├── engine/        # Healing layers, locator engines, LLM
├── healing/       # SelfHeal + CandidateBuilder
├── learning/      # LearningStore + FixApplier
├── pages/         # Page Object Models
├── dashboard/     # Live web dashboard server
├── security/      # SecurityEnforcer
├── utils/         # NavigationGuard, PreFlightCheck, SiteAvailability
└── tests/         # Test suites
```

---

## 🔒 Security

- All locators scanned before use (CWE-94, CWE-95)
- No hardcoded credentials (CWE-798)
- SSRF protection in ApiClient
- SSL enforced in CI
- RBAC on dashboard API
- Rate limiting: 30 req/min

---

## 📈 Performance

- 97-99% pass rate with Docker
- 7.4 min full run (reduced from 22 min)
- 500 entry learning DB with 30-day TTL
- Zero TypeScript errors

---

## 🛠️ Tech Stack

- **Playwright** + **TypeScript**
- **Node.js** + **Express** (dashboard)
- **Ollama** (local LLM)
- **Docker Compose**
- **GitHub Actions**
- **Jest** (unit tests)

---

## 📜 License

MIT License — see [LICENSE](LICENSE)

---

## 👤 Author

**Pola Venkata Rama Krishna**
- GitHub: [@ramakrishna11237](https://github.com/ramakrishna11237)
- Email: ramakrishna11237@gmail.com
