import type { ChartData, ChartOptions } from 'chart.js';
import { ComponentType, lazy, Suspense } from 'react';

const lineChartOptions = {
  responsive: true,
  scales: {
    y: {
      min: 0,
    },
  },
  plugins: {
    legend: {
      position: 'bottom' as const,
    },
  },
};

interface LineChartProps {
  readonly chartData: ChartData<'line', number[], string>;
}

const AsyncLine = lazy(async () => {
  const { CategoryScale, Chart, Legend, LinearScale, LineElement, PointElement, Title, Tooltip } = await import(
    'chart.js'
  );
  Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
  const { Line } = await import('react-chartjs-2');
  return {
    default: Line as ComponentType<{ data: ChartData<'line', number[], string>; options: ChartOptions<'line'> }>,
  };
});

export function LineChart({ chartData }: LineChartProps): JSX.Element {
  return (
    <div className="my-5">
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncLine options={lineChartOptions} data={chartData} />
      </Suspense>
    </div>
  );
}
