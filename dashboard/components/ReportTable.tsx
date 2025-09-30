// dashboard/components/ReportTable.tsx
"use client";
import { useEffect, useState } from 'react';

interface Feature {
  name: string;
  status: 'baseline' | 'non-baseline';
  file: string;
}

interface Report {
  summary: {
    baseline: number;
    non_baseline: number;
  };
  features: Feature[];
}

const ReportTable: React.FC = () => {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/report.json')
      .then((res) => res.json())
      .then((data) => setReport(data))
      .catch((err) => setError('Failed to load report: ' + err.message));
  }, []);

  if (error) return <div className="text-red-500 text-center">{error}</div>;
  if (!report) return <div className="text-center">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Baseline Compatibility Report</h1>
      <p className="mb-4">
        Summary: {report.summary.baseline} Baseline, {report.summary.non_baseline} Non-Baseline
      </p>
      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 p-2">Feature</th>
            <th className="border border-gray-300 p-2">Status</th>
            <th className="border border-gray-300 p-2">File</th>
          </tr>
        </thead>
        <tbody>
          {report.features.map((feature, index) => (
            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="border border-gray-300 p-2">{feature.name}</td>
              <td className="border border-gray-300 p-2">
                <span
                  className={
                    feature.status === 'baseline'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }
                >
                  {feature.status}
                </span>
              </td>
              <td className="border border-gray-300 p-2">{feature.file}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ReportTable;