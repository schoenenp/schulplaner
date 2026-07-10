import { Loader } from "lucide-react"
export default function LoadingSpinner() {
    return <div className="w-full flex justify-center items-center">
    <Loader className="animate-spin min-w-4 max-w-12"  />
</div>
}