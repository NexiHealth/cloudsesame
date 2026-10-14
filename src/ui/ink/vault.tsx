import { Box, Text, useAnimation, useInput, useStdin, useWindowSize } from "ink";
import { useEffect, useMemo } from "react";
import { colorDepth, DURATION, renderFrame } from "../vault/scene";

const MAX_WIDTH = 72;
const MAX_ROWS = 18;

/** Plays the open-sesame animation once; any key skips it. */
export function Vault({ onDone }: { onDone: () => void }) {
  const { columns, rows } = useWindowSize();
  const { isRawModeSupported } = useStdin();
  const { time } = useAnimation({ interval: 33 });
  const width = Math.min(columns, MAX_WIDTH);
  const height = Math.max(6, Math.min(rows - 3, MAX_ROWS));
  const finished = time >= DURATION;

  useInput(() => onDone(), { isActive: isRawModeSupported });
  useEffect(() => {
    if (finished) onDone();
  }, [finished]);

  const depth = useMemo(() => colorDepth(), []);
  const lines = useMemo(() => renderFrame(Math.min(time, DURATION), width, height, depth), [time, width, height, depth]);
  const title = time > 900 ? "o p e n   s e s a m e" : "";

  return (
    <Box flexDirection="column" marginTop={1}>
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      <Box width={width} justifyContent="center">
        <Text color="#ffc454" bold>
          {title}
        </Text>
      </Box>
    </Box>
  );
}
