import { Box, Text } from "ink";
import { formatResponse } from "../../format.js";

export function AssistantMessage({ text }: { text: string }) {
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text>{formatResponse(text)}</Text>
    </Box>
  );
}
