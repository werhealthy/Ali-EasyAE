#!/bin/bash

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_DIR="/Users/francesco.cerisano/Documents/GitHub/Ali-EasyAE"

echo -e "${GREEN}🚀 Avvio Ali-EasyAE...${NC}"
echo ""

# Avvia Bridge Server in background
echo -e "${BLUE}🌉 Avvio Bridge Server (porta 3001)...${NC}"
cd "$PROJECT_DIR/bridge-server"
node index.js > /tmp/ali-bridge.log 2>&1 &
BRIDGE_PID=$!
echo "   ✓ Bridge Server avviato (PID: $BRIDGE_PID)"

# Attendi 2 secondi
sleep 2

# Avvia Next.js Dev Server
echo -e "${BLUE}⚛️  Avvio Next.js Web UI (porta 3000)...${NC}"
cd "$PROJECT_DIR/web-ui"
npm run dev > /tmp/ali-nextjs.log 2>&1 &
NEXTJS_PID=$!
echo "   ✓ Next.js avviato (PID: $NEXTJS_PID)"

# Attendi che Next.js si avvii
echo ""
echo -e "${BLUE}⏳ Attendo che Next.js sia pronto...${NC}"
sleep 8

# Apri il browser
echo -e "${GREEN}🌐 Apertura interfaccia web...${NC}"
open http://localhost:3000

echo ""
echo -e "${GREEN}✅ Ali-EasyAE è pronto!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Server attivi:"
echo "   • Bridge Server: http://localhost:3001"
echo "   • Web UI: http://localhost:3000"
echo ""
echo "📝 Log disponibili in:"
echo "   • Bridge: tail -f /tmp/ali-bridge.log"
echo "   • Next.js: tail -f /tmp/ali-nextjs.log"
echo ""
echo "🛑 Per fermare tutto:"
echo "   ./stop-ali-easyae.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Salva i PID per lo script di stop
echo "$BRIDGE_PID $NEXTJS_PID" > /tmp/ali-easyae-pids.txt

# Mantieni la finestra aperta
echo "💡 Lascia questa finestra aperta finché usi Ali-EasyAE"
echo ""
read -p "Premi INVIO per chiudere e fermare i server..."

# Ferma i server quando chiudi
kill $BRIDGE_PID $NEXTJS_PID 2>/dev/null
rm /tmp/ali-easyae-pids.txt 2>/dev/null
echo "👋 Server fermati. Arrivederci!"
