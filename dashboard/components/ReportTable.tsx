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
       import { Parser } from 'json2csv';

       ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

       interface Feature {
         name: string;
         status: 'baseline' | 'non-baseline';
         file: string;
         line?: number;
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
         const [filteredFeatures, setFilteredFeatures] = useState<Feature[]>([]);
         const [featureFilter, setFeatureFilter] = useState<string>('');
         const [fileTypeFilter, setFileTypeFilter] = useState<string>('all');

         useEffect(() => {
           fetch('/report.json')
             .then((res) => res.json())
             .then((data) => {
               setReport(data);
               setFilteredFeatures(data.features);
             })
             .catch((err) => setError('Failed to load report: ' + err.message));
         }, []);

         useEffect(() => {
           if (!report) return;
           let filtered = report.features;

           if (featureFilter) {
             filtered = filtered.filter(feat => feat.name.toLowerCase().includes(featureFilter.toLowerCase()));
           }

           if (fileTypeFilter !== 'all') {
             filtered = filtered.filter(feat => 
               (fileTypeFilter === 'js' && feat.file.endsWith('.js')) ||
               (fileTypeFilter === 'css' && feat.file.endsWith('.css'))
             );
           }

           setFilteredFeatures(filtered);
         }, [report, featureFilter, fileTypeFilter]);

         const downloadCSV = () => {
           const fields = ['name', 'status', 'file', 'line'];
           const csvParser = new Parser({ fields });
           const csv = csvParser.parse(filteredFeatures);
           const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
           const url = URL.createObjectURL(blob);
           const link = document.createElement('a');
           link.setAttribute('href', url);
           link.setAttribute('download', 'report.csv');
           document.body.appendChild(link);
           link.click();
           document.body.removeChild(link);
           URL.revokeObjectURL(url);
         };

         const downloadJSON = () => {
           const output = {
             summary: {
               baseline: filteredFeatures.filter(f => f.status === 'baseline').length,
               non_baseline: filteredFeatures.filter(f => f.status === 'non-baseline').length,
             },
             features: filteredFeatures,
           };
           const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json;charset=utf-8;' });
           const url = URL.createObjectURL(blob);
           const link = document.createElement('a');
           link.setAttribute('href', url);
           link.setAttribute('download', 'report.json');
           document.body.appendChild(link);
           link.click();
           document.body.removeChild(link);
           URL.revokeObjectURL(url);
         };

         if (error) return <div className="text-red-500 text-center">{error}</div>;
         if (!report) return <div className="text-center">Loading...</div>;

         const featuresByFile = filteredFeatures.reduce((acc, feature) => {
           acc[feature.file] = acc[feature.file] || [];
           acc[feature.file].push(feature);
           return acc;
         }, {} as { [file: string]: Feature[] });

         const chartData = {
           labels: ['Baseline Status'],
           datasets: [
             {
               label: 'Baseline',
               data: [filteredFeatures.filter(f => f.status === 'baseline').length],
               backgroundColor: '#16a34a', // Green
             },
             {
               label: 'Non-Baseline',
               data: [filteredFeatures.filter(f => f.status === 'non-baseline').length],
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

         const uniqueFeatures = [...new Set(report.features.map(f => f.name))];
         const uniqueFileTypes = ['all', 'js', 'css'];

         return (
           <div className="max-w-4xl mx-auto p-4">
             <h1 className="text-2xl font-bold mb-4">Baseline Compatibility Report</h1>
             <div className="mb-4 flex gap-4">
               <div>
                 <label className="block text-sm font-medium">Filter by Feature:</label>
                 <input
                   type="text"
                   value={featureFilter}
                   onChange={(e) => setFeatureFilter(e.target.value)}
                   placeholder="e.g., fetch"
                   className="mt-1 block w-full rounded-md border-gray-300"
                 />
               </div>
               <div>
                 <label className="block text-sm font-medium">Filter by File Type:</label>
                 <select
                   value={fileTypeFilter}
                   onChange={(e) => setFileTypeFilter(e.target.value)}
                   className="mt-1 block w-full rounded-md border-gray-300"
                 >
                   {uniqueFileTypes.map((type) => (
                     <option key={type} value={type}>
                       {type}
                     </option>
                   ))}
                 </select>
               </div>
             </div>
             <div className="mb-4 flex gap-4">
               <button
                 onClick={downloadCSV}
                 className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
               >
                 Download CSV
               </button>
               <button
                 onClick={downloadJSON}
                 className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
               >
                 Download JSON
               </button>
             </div>
             <p className="mb-4">
               Summary ({filteredFeatures.length} features): {filteredFeatures.filter(f => f.status === 'baseline').length} Baseline, {filteredFeatures.filter(f => f.status === 'non-baseline').length} Non-Baseline
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
                   <th className="border border-gray-300 p-2">Line</th>
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
                     <td className="border border-gray-300 p-2">{feature.line || 'N/A'}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
             <h2 className="text-xl font-semibold mb-2">Per-File Feature Breakdown</h2>
             {Object.entries(featuresByFile).map(([file, features], index) => (
               <div key={file} className="mb-6">
                 <h3 className="text-lg font-medium mb-2">{file}</h3>
                 <table className="w-full border-collapse border border-gray-300">
                   <thead>
                     <tr className="bg-gray-100">
                       <th className="border border-gray-300 p-2">Feature</th>
                       <th className="border border-gray-300 p-2">Status</th>
                       <th className="border border-gray-300 p-2">Line</th>
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
                         <td className="border border-gray-300 p-2">{feature.line || 'N/A'}</td>
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