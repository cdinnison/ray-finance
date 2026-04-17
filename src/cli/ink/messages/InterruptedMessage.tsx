import { Box, Text } from "ink";
import chalk from "chalk";

export function InterruptedMessage() {
  return (
    <Box marginTop={1} marginBottom={1}>
      <Text>{chalk.dim("(interrupted)")}</Text>
    </Box>
  );
}
