import { createFileRoute } from '@tanstack/react-router';
import { ConnectedGate } from '../screens/connected-gate.tsx';

export const Route = createFileRoute('/_connected')({
  component: ConnectedGate,
});
