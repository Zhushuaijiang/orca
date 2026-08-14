# Focused test-case rules

1. Group by the actual business module or entry point.
2. Name exact status, parameter, role, precision, and payment values.
3. Start with the changed positive/negative rule and add only required adjacent regression.
4. Split cases only when the action path or observable result differs.
5. Mark missing data as skipped or blocked; never fabricate a pass.
6. For blocking behavior, verify both the prompt and absence of the downstream action.
7. Keep the local Markdown authoritative and map every automated test to a case ID.
