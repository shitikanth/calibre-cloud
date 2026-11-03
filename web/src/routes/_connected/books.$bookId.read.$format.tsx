import { createFileRoute } from '@tanstack/react-router';
import { ReaderScreen } from '../../screens/reader-screen.tsx';

export const Route = createFileRoute('/_connected/books/$bookId/read/$format')({
  component: ReaderRoute,
});

function ReaderRoute() {
  const { bookId, format } = Route.useParams();
  return <ReaderScreen bookId={bookId} format={format} />;
}
