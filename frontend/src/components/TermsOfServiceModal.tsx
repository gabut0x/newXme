import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

interface TermsOfServiceModalProps {
  children: React.ReactNode;
}

export function TermsOfServiceModal({ children }: TermsOfServiceModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Terms of Service
          </DialogTitle>
          <DialogDescription>
            Please read these terms and conditions carefully before using XME Projects.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] w-full rounded-md border p-6">
          <div className="space-y-6 text-sm">
            <section>
              <h3 className="font-semibold text-lg mb-3">1. Acceptance of Terms</h3>
              <p className="text-muted-foreground leading-relaxed">
                By accessing and using XME Projects, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">2. Use License</h3>
              <p className="text-muted-foreground leading-relaxed mb-2">
                Permission is granted to temporarily download one copy of XME Projects services for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                <li>modify or copy the materials</li>
                <li>use the materials for any commercial purpose or for any public display</li>
                <li>attempt to reverse engineer any software contained on the website</li>
                <li>remove any copyright or other proprietary notations from the materials</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">3. Service Description</h3>
              <p className="text-muted-foreground leading-relaxed">
                XME Projects provides VPS (Virtual Private Server) management services, automated installations, and server monitoring solutions. We strive to maintain high uptime and quality service but cannot guarantee uninterrupted service.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">4. User Accounts</h3>
              <p className="text-muted-foreground leading-relaxed">
                Users are responsible for maintaining the confidentiality of their account credentials and for all activities that occur under their account. You agree to immediately notify us of any unauthorized use of your account.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">5. Payment Terms</h3>
              <p className="text-muted-foreground leading-relaxed">
                All payments for services are processed securely through our payment partners. Refunds may be available according to our refund policy. Users are responsible for any applicable taxes related to their purchases.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">6. Refund Policy</h3>
              <p className="text-muted-foreground leading-relaxed">
                If a user experiences failure or errors during the installation process, the user is entitled to receive a refund in the form of quota equivalent to the number of failed or problematic processes.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">7. Prohibited Activities</h3>
              <p className="text-muted-foreground leading-relaxed mb-2">
                Users agree not to use the service for:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
                <li>Any illegal activities or violation of applicable laws</li>
                <li>Hosting malicious content or malware</li>
                <li>Spamming or unsolicited communications</li>
                <li>Resource abuse or denial of service attacks</li>
                <li>Any activity that may harm other users or the service infrastructure</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">8. Privacy Policy</h3>
              <p className="text-muted-foreground leading-relaxed">
                Your privacy is important to us. We collect and use information in accordance with our Privacy Policy. By using our service, you consent to the collection and use of information as outlined in our Privacy Policy.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">9. Service Availability</h3>
              <p className="text-muted-foreground leading-relaxed">
                We strive to maintain service availability but cannot guarantee 100% uptime. Scheduled maintenance will be announced in advance when possible. We are not liable for any damages resulting from service interruptions.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">10. Limitation of Liability</h3>
              <p className="text-muted-foreground leading-relaxed">
                In no event shall XME Projects or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the service.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">11. Termination</h3>
              <p className="text-muted-foreground leading-relaxed">
                We may terminate or suspend your account and access to the service at any time, without prior notice or liability, for any reason including breach of these Terms of Service.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">12. Changes to Terms</h3>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting. Your continued use of the service constitutes acceptance of the modified terms.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-lg mb-3">13. Contact Information</h3>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about these Terms of Service, please contact us through our support channels or email us at xme.noreply@gmail.com.
              </p>
            </section>

            <section className="pt-4 border-t">
              <p className="text-xs text-muted-foreground text-center">
                Last updated: {new Date().toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}