import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseOauthEmailId, fetchEmailForReply } from '@/lib/email/fetch';

/**
 * Generate an AI reply to an email, using the email (and thread) as context.
 * POST body: { emailId: string }
 * emailId can be: UUID (webhook email) or "connectionId:messageId" (OAuth email)
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { emailId, signerName } = body;
  if (!emailId) {
    return NextResponse.json({ error: 'emailId is required' }, { status: 400 });
  }

  let threadContext: string;

  const oauth = parseOauthEmailId(emailId);
  if (oauth) {
    const { data: myMembership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    if (!myMembership) {
      return NextResponse.json({ error: 'Not in an organization' }, { status: 403 });
    }

    const emailData = await fetchEmailForReply(
      oauth.connectionId,
      oauth.messageId,
      user.id,
      myMembership.organization_id
    );

    if (!emailData) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    threadContext = emailData.threadEmails
      .map(
        (e) =>
          `From: ${e.senderName || e.senderEmail} <${e.senderEmail}>\nDate: ${e.receivedAt}\nSubject: ${e.subject || '(no subject)'}\n\n${(e.bodyText || '').slice(0, 2000)}`
      )
      .join('\n\n---\n\n');
  } else {
    const { data: email, error: emailError } = await supabase
      .from('inbound_emails')
      .select('id, sender_email, sender_name, subject, body_text, body_html, thread_id, received_at')
      .eq('id', emailId)
      .single();

    if (emailError || !email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    let threadEmails: typeof email[] = [email];
    if (email.thread_id) {
      const { data: thread } = await supabase
        .from('inbound_emails')
        .select('id, sender_email, sender_name, subject, body_text, received_at')
        .eq('thread_id', email.thread_id)
        .order('received_at', { ascending: true });
      if (thread?.length) threadEmails = thread;
    }

    threadContext = threadEmails
      .map(
        (e) =>
          `From: ${e.sender_name || e.sender_email} <${e.sender_email}>\nDate: ${e.received_at}\nSubject: ${e.subject || '(no subject)'}\n\n${(e.body_text || e.body_html || '').slice(0, 2000)}`
      )
      .join('\n\n---\n\n');
  }

  const signer = (signerName && String(signerName).trim()) || 'Your name';
  const systemPrompt = `You are a professional sales rep writing a reply to an email. Write a concise, helpful response that addresses the sender's message. Match the tone of the conversation. Do not include email headers (From, To, Subject) - only the body of your reply.

SIGNATURE: You MUST sign the reply with "Best," or "Best regards," followed by a newline and then exactly this name: ${signer}. Never use "[Your name]", "AI Email Writer", or invent a name. Use exactly the name provided.`;

  const userPrompt = `Here is the email thread to reply to:\n\n${threadContext}\n\nWrite a reply to the most recent message:`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 800,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API error:', errorText);
      return NextResponse.json({ error: 'AI service error' }, { status: 500 });
    }

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content?.trim() || '';
    if (signer && signer !== 'Your name') {
      reply = reply.replace(/\[Your name\]/gi, signer);
      reply = reply.replace(/\bAI Email Writer\b/gi, signer);
      reply = reply.replace(/(Best,?|Best regards,?|Thanks,?|Regards,?)\s*\n\s*[^\n]+$/gm, `$1\n${signer}`);
    }
    return NextResponse.json({ reply });
  } catch (error) {
    console.error('AI generate-email-reply error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
