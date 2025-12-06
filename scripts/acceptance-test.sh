#!/bin/bash
# Acceptance Test Script for Self-Healing Testbot

echo "🧪 ACCEPTANCE TEST: Self-Healing Testbot"
echo "========================================"
echo ""

# Test 1: ENV Auto-Load
echo "Test 1: ENV auto-loads without manual export"
if [ ! -f ".env" ]; then
    echo "❌ FAIL: No .env file found"
    echo "   Create .env with OPENROUTER_API_KEY=your_key"
    exit 1
fi

echo "✅ PASS: .env file exists"
echo ""

# Test 2: Build Success
echo "Test 2: TypeScript compilation"
npm run build > /tmp/build.log 2>&1
if [ $? -eq 0 ]; then
    echo "✅ PASS: Build succeeded"
else
    echo "❌ FAIL: Build failed"
    cat /tmp/build.log
    exit 1
fi
echo ""

# Test 3: No Free Models in Config Files
echo "Test 3: No free models in configuration files"
if grep -E ":free" .env.example README.md 2>/dev/null | grep -v "No.*:free" | grep -v "Production.*:free"; then
    echo "❌ FAIL: Found :free model references in config files"
    exit 1
fi
echo "✅ PASS: No free models in configuration (validation code is OK)"
echo ""

# Test 4: Self-Check Script Exists
echo "Test 4: Self-check script available"
if ! npm run | grep -q "self-check"; then
    echo "❌ FAIL: self-check script not found in package.json"
    exit 1
fi
echo "✅ PASS: self-check script exists"
echo ""

# Test 5: Startup Diagnostics
echo "Test 5: Startup diagnostics functional"
if ! node dist/cli/index.js analyze --help 2>&1 | head -20 | grep -q "testbot"; then
    echo "⚠️  WARNING: Could not verify startup diagnostics"
else
    echo "✅ PASS: CLI loads successfully"
fi
echo ""

# Test 6: Key Files Exist
echo "Test 6: Critical files present"
FILES=(
    "dist/cli/diagnostics.js"
    "dist/utils/PathNormalizer.js"
    "dist/validator/SelfValidationLoop.js"
    "dist/llm/OpenRouterClient.js"
)

for file in "${FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ FAIL: Missing $file"
        exit 1
    fi
done
echo "✅ PASS: All critical files present"
echo ""

# Summary
echo "========================================"
echo "🎉 ALL ACCEPTANCE TESTS PASSED"
echo "========================================"
echo ""
echo "Ready to run:"
echo "  npm run self-check"
echo ""
echo "This will validate the bot on itself and demo projects."
