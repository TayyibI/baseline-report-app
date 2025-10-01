"use client";

     import { useEffect, useState } from 'react';
     import { Bar } from 'react-chartjs-2';
     import {
       Chart as ChartJS,
       CategoryScale,
       LinearScale,
       BarElement,
       Title,
       Tooltip,
       Legend,
     } from 'chart.js';

     ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

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
       const [filterFeature, setFilterFeature] = useState<string>('');
       const [filterFileType, setFilterFileType] = useState<string>('all');

       useEffect(() => {
         fetch('/report.json')
           .then((res) => res.json())
           .then((data) => setReport(data))
           .catch((err) => setError('Failed to load report: ' + err.message));
       }, []);

       if (error) return <div className="text-red-500 text-center">{error}</div>;
       if (!report) return <div className="text-center">Loading...</div>;

       // Filter features
       let filteredFeatures = report.features;
       if (filterFeature) {
         filteredFeatures = filteredFeatures.filter(f => f.name.toLowerCase() === filterFeature.toLowerCase());
       }
       if (filterFileType !== 'all') {
         filteredFeatures = filteredFeatures.filter(f => f.file.endsWith(filterFileType));
       }

       // Group filtered features by file for per-file table
       const featuresByFile = filteredFeatures.reduce((acc, feature) => {
         acc[feature.file] = acc[feature.file] || [];
         acc[feature.file].push(feature);
         return acc;
       }, {} as { [file: string]: Feature[] });

       // Update summary for filtered data
       const filteredSummary = {
         baseline: filteredFeatures.filter(f => f.status === 'baseline').length,
         non_baseline: filteredFeatures.filter(f => f.status === 'non-baseline').length,
       };

       const chartData = {
         labels: ['Filtered Status'],
         datasets: [
           {
             label: 'Baseline',
             data: [filteredSummary.baseline],
             backgroundColor: '#16a34a', // Green
           },
           {
             label: 'Non-Baseline',
             data: [filteredSummary.non_baseline],
             backgroundColor: '#dc2626', // Red
           },
         ],
       };

       const chartOptions = {
         responsive: true,
         maintainAspectRatio: false,
         plugins: {
           legend: { position: 'top' as const },
           title: { display: true, text: 'Filtered Feature Compatibility Summary' },
         },
         scales: {
           y: { beginAtZero: true, title: { display: true, text: 'Count' } },
         },
       };

       return (
         <div className="max-w-4xl mx-auto p-4">
           <h1 className="text-2xl font-bold mb-4">Baseline Compatibility Report</h1>
           <div className="mb-4">
             <label className="mr-4">
               Filter by Feature:
               <select
                 value={filterFeature}
                 onChange={(e) => setFilterFeature(e.target.value)}
                 className="ml-2 p-1 border border-gray-300 rounded"
               >
                 <option value="">All Features</option>
                 {[...new Set(report.features.map(f => f.name))].map(name => (
                   <option key={name} value={name}>{name}</option>
                 ))}
               </select>
             </label>
             <label>
               Filter by File Type:
               <select
                 value={filterFileType}
                 onChange={(e) => setFilterFileType(e.target.value)}
                 className="ml-2 p-1 border border-gray-300 rounded"
               >
                 <option value="all">All Files</option>
                 <option value="js">JS Files</option>
                 <option value="css">CSS Files</option>
               </select>
             </label>
           </div>
           <p className="mb-4">
             Filtered Summary: {filteredSummary.baseline} Baseline, {filteredSummary.non_baseline} Non-Baseline
           </p>
           <div className="mb-8 h-64">
             <Bar data={chartData} options={chartOptions} />
           </div>
           <h2 className="text-xl font-semibold mb-2">Filtered Feature Overview</h2>
           <table className="w-full border-collapse border border-gray-300 mb-8">
             <thead>
               <tr className="bg-gray-100">
                 <th className="border border-gray-300 p-2">Feature</th>
                 <th className="border border-gray-300 p-2">Status</th>
                 <th className="border border-gray-300 p-2">File</th>
               </tr>
             </thead>
             <tbody>
               {filteredFeatures.map((feature, index) => (
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
           <h2 className="text-xl font-semibold mb-2">Per-File Feature Breakdown (Filtered)</h2>
           {Object.entries(featuresByFile).map(([file, features], index) => (
             <div key={file} className="mb-6">
               <h3 className="text-lg font-medium mb-2">{file}</h3>
               <table className="w-full border-collapse border border-gray-300">
                 <thead>
                   <tr className="bg-gray-100">
                     <th className="border border-gray-300 p-2">Feature</th>
                     <th className="border border-gray-300 p-2">Status</th>
                   </tr>
                 </thead>
                 <tbody>
                   {features.map((feature, fIndex) => (
                     <tr key={fIndex} className={fIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
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
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           ))}
         </div>
       );
     };

     export default ReportTable;