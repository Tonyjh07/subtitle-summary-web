import { ResultView } from "@/components/result/result-view";

export const metadata = {
  title: "转写结果",
};

export default function ResultPage({
  params,
}: {
  params: { taskId: string };
}) {
  return <ResultView taskId={params.taskId} />;
}
