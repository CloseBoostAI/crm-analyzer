export async function generateFollowUpEmail(followUp: any, notes: string[]) {
  try {
    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const notesText = notes.join(" ")

    let emailContent = `Dear ${followUp.customer},

I hope this email finds you well. I wanted to follow up regarding our recent interaction about ${followUp.reason.toLowerCase()}.

`

    if (notesText.includes("feature")) {
      emailContent +=
        "I recall your interest in our new features. I'd be happy to schedule a demo to show you how these features can benefit your workflow.\n\n"
    }

    if (notesText.includes("price") || notesText.includes("competitor")) {
      emailContent +=
        "I understand you have some concerns about pricing. I'd like to discuss how we can provide the best value for your investment and address any comparisons with other solutions you might be considering.\n\n"
    }

    if (notesText.includes("technical") || notesText.includes("issue")) {
      emailContent +=
        "I want to ensure that any technical issues you've experienced have been fully resolved. Let's schedule a call with our support team to address any ongoing concerns.\n\n"
    }

    if (notesText.includes("renewal")) {
      emailContent +=
        "As we approach your contract renewal date, I'd like to discuss how we can continue to support your business needs and explore any additional services that might be beneficial.\n\n"
    }

    emailContent += `Based on our records, I believe it would be beneficial to reconnect and discuss next steps. Would you be available for a brief call on ${new Date(followUp.suggestedDate).toLocaleDateString()}?

I'm looking forward to addressing any questions you might have and exploring how we can best support your needs.

Best regards,
Your Account Manager`

    return emailContent
  } catch (error) {
    console.error("Error generating email:", error)
    throw new Error("Failed to generate email. Please try again later.")
  }
}

