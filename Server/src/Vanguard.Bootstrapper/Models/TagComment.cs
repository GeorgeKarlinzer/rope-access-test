namespace Vanguard.Bootstrapper.Models
{
    public class TagComment
    {
        public Guid Id { get; set; }
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
        public string Text { get; set; } = string.Empty;
    }
}

