import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  Rocket, 
  ArrowRight,
  Code
} from 'lucide-react';

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="octra-header">
        <div className="app-container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <Code className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold">XME Projects</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="outline" size="sm">
                Login
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-container py-10">
        {/* Hero Section */}
        <section className="text-center mb-16 octra-fade-in pt-8 md:pt-14 md:mt-10">
          <div className="narrow-container">
            <Badge variant="secondary" className="mb-6">
              🚀 One-Click VPS to Windows OS Solution
            </Badge>
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-foreground leading-tight">
              Turn your VPS into Windows RDP seamlessly
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              Transform any Virtual Private Server into a fully functional Windows Remote Desktop environment. 
              No complex setup, no technical expertise required.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link to="/register">
                <Button size="lg" className="text-lg px-8 py-6">
                  <Rocket className="mr-2 h-5 w-5" />
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t bg-background/80 backdrop-blur-sm z-10">
        <div className="app-container py-2">         
          <div className="text-center text-muted-foreground">
        <p className='text-xs'>&copy; {new Date().getFullYear()} XME Projects. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}