#!/bin/bash
echo "🧹 Pulizia file temporanei vecchi..."
find _temp_data/uploads/ -type f -mtime +7 -delete 2>/dev/null
find _temp_data/processing/ -type f -mtime +7 -delete 2>/dev/null
find _temp_data/renders/ -type f -mtime +7 -delete 2>/dev/null
echo "✅ Pulizia completata!"
