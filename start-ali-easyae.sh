#!/bin/bash

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Termina processi esistenti
echo -e "${YELLOW}🧹 Pulizia processi esistenti...${NC}"
pkill -f "node.*bridge-server"
pkill -f "next-server"
pkill -f "ngrok http"
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 2

# Directory del progetto
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${GREEN}🚀 Avvio Ali-EasyAE...${NC}"
echo ""

# Avvia Bridge Server in background
echo -e "${BLUE}🌉 Bridge Server (porta 3001)...${NC}"
cd "$PROJECT_DIR/bridge-server"
node index.js &
sleep 3

# Avvia Next.js in background  
echo -e "${BLUE}⚛️  Next.js (porta 3000)...${NC}"
cd "$PROJECT_DIR/web-ui"
npm run dev &
sleep 8

echo ""
echo -e "${GREEN}✅ Ali-EasyAE è pronto!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Server attivi:"
echo "   • Bridge Server: http://localhost:3001"
echo "   • Web UI: http://localhost:3000"
echo ""
echo "🌐 Apertura browser..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Apri automaticamente il browser
sleep 2
open http://localhost:3000

echo "💡 Lascia questa finestra aperta finché usi Ali-EasyAE"
echo ""
read -p "Premi INVIO per chiudere e fermare i server..."

# Cleanup quando chiudi
pkill -f "node.*bridge-server"
pkill -f "next-server"
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:3001 | xargs kill -9 2>/dev/null

echo "👋 Server fermati. Arrivederci!"
