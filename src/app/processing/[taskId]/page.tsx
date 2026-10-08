import { ProcessingView } from "@/components/processing/processing-view";

export const metadata = {
  title: "转写中",
};

export default function ProcessingPage({
  params,
}: {
  params: { taskId: string };
}) {
  return <ProcessingView taskId={params.taskId} />;
}
