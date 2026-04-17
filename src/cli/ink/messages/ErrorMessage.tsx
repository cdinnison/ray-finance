import { Box, Text } from "ink";
import { formatError } from "../../format.js";

export function ErrorMessage({ error, context }: { error: unknown; context?: string }) {
  return (
    <Box marginTop={1} marginBottom={1}>
      <Text>{formatError(error, context)}</Text>
    </Box>
  );
}
