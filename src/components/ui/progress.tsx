export const Progress = ({ value, className }: { value?: number; className?: string }) => (
    <div className={`w-full bg-gray-200 rounded-full h-2.5 ${className ?? ''}`}>
        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${value}%` }}></div>
    </div>
);
