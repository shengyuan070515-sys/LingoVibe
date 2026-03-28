export const Avatar = ({ className, ...props }: any) => <div className={`w-10 h-10 rounded-full bg-gray-300 ${className}`} {...props} />;
export const AvatarImage = (props: any) => <img className="w-full h-full rounded-full object-cover" {...props} />;
export const AvatarFallback = ({ className, ...props }: any) => <div className={`w-full h-full flex items-center justify-center rounded-full bg-gray-400 text-white ${className}`} {...props} />;
