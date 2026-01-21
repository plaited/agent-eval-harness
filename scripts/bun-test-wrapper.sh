#!/bin/bash
# Wrapper for bun test that handles Bun's post-test cleanup crash
# See: https://github.com/oven-sh/bun/issues/23643
#
# Bun 1.3.x has a known bug where the test runner crashes during cleanup
# after all tests complete successfully. This wrapper catches that crash
# (exit code 133 = SIGTRAP) and exits cleanly if tests actually passed.

# Create temp file for output
tmpfile=$(mktemp)
trap "rm -f $tmpfile" EXIT

# Run integration tests with output to both terminal and file
bun test ./**/integration_tests/*.spec.ts 2>&1 | tee "$tmpfile"
exit_code=${PIPESTATUS[0]}

# Check if tests passed (look for "X pass" and "0 fail" in output)
if grep -q " pass" "$tmpfile" && grep -q "0 fail" "$tmpfile"; then
  # Tests passed - exit 0 even if Bun crashed during cleanup
  if [ $exit_code -eq 133 ]; then
    echo ""
    echo "Note: Bun crashed during cleanup (known bug), but all tests passed."
    exit 0
  fi
fi

exit $exit_code
