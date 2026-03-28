export const Separator = ({ orientation = 'horizontal', className, ...props }: { orientation?: 'horizontal' | 'vertical', className?: string }) => (
    <div className={`bg-gray-200 ${orientation === 'horizontal' ? 'h-px w-full' : 'w-px h-full'} ${className}`} {...props} />
);
