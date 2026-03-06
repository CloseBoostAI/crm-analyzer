import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BarChart3, Zap, Activity } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <section className="relative w-full py-10 md:py-16 lg:py-20 xl:py-24 overflow-hidden bg-slate-900 min-h-[calc(100vh-4rem)] flex flex-col justify-center">
          <div 
            className="absolute inset-0 bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,black_65%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_65%,transparent_100%)]" 
            style={{
              backgroundImage: `
                linear-gradient(to right, hsl(199 89% 48% / 0.08) 1px, transparent 1px),
                linear-gradient(to bottom, hsl(199 89% 48% / 0.08) 1px, transparent 1px)
              `,
            }}
          />
          <div className="container relative px-4 md:px-6">
            <div className="flex flex-col items-center space-y-5 text-center max-w-4xl mx-auto">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/15 border border-primary/30 text-primary text-sm font-medium">
                AI-Powered CRM Analytics
              </div>
              <h2 className="font-heading text-5xl font-bold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl text-white drop-shadow-lg">
                CloseBoostAI
              </h2>
              <div className="space-y-3">
                <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl text-white drop-shadow-lg">
                  Supercharge your
                  <span className="block bg-gradient-to-r from-cyan-400 via-primary to-teal-400 bg-clip-text text-transparent">
                    sales pipeline
                  </span>
                </h1>
                <p className="mx-auto max-w-[600px] text-slate-300 md:text-lg lg:text-xl">
                  Upload your CRM logs. Get AI-driven insights, smart task recommendations, and personalized email drafts—all in one place.
                </p>
              </div>
              <div>
                <Link href="/analytics">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-5 text-base font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all">
                    View Analytics
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
        
        <section className="w-full py-16 md:py-24 lg:py-32 bg-slate-900">
          <div className="container px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl text-white mb-3">
                Built for modern sales teams
              </h2>
              <p className="text-slate-300 max-w-2xl mx-auto">
                Everything you need to close more deals, faster.
              </p>
            </div>
            <div className="grid gap-8 lg:grid-cols-3 items-stretch">
              <div className="group flex flex-col p-8 rounded-xl border-2 border-slate-600/50 bg-slate-800/80 shadow-lg hover:shadow-xl hover:border-primary/40 hover:-translate-y-1 transition-all duration-300">
                <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <BarChart3 className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-heading text-xl font-bold tracking-tight sm:text-2xl mb-2 text-white">
                  Smart Analysis
                </h3>
                <p className="text-slate-300 flex-1">
                  AI algorithms analyze your CRM data to surface deals at risk, follow-up opportunities, and actionable next steps.
                </p>
              </div>
              <div className="group flex flex-col p-8 rounded-xl border-2 border-slate-600/50 bg-slate-800/80 shadow-lg hover:shadow-xl hover:border-primary/40 hover:-translate-y-1 transition-all duration-300">
                <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Zap className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-heading text-xl font-bold tracking-tight sm:text-2xl mb-2 text-white">
                  One-Click Upload
                </h3>
                <p className="text-slate-300 flex-1">
                  Drop your CRM export and we handle the rest. No complex setup—just upload and start getting insights.
                </p>
              </div>
              <div className="group flex flex-col p-8 rounded-xl border-2 border-slate-600/50 bg-slate-800/80 shadow-lg hover:shadow-xl hover:border-primary/40 hover:-translate-y-1 transition-all duration-300">
                <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <Activity className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-heading text-xl font-bold tracking-tight sm:text-2xl mb-2 text-white">
                  Real-time Insights
                </h3>
                <p className="text-slate-300 flex-1">
                  Pipeline stats, deal stage distribution, and AI-generated follow-up emails—all updated as you work.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

