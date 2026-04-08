using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Vanguard.Bootstrapper.Models;
using Vanguard.Bootstrapper.Persistence;
using Vanguard.Bootstrapper.Reports;

namespace Vanguard.Bootstrapper.Controllers;

[ApiController]
[Route("api/buildings")]
public sealed class BuildingsController : ControllerBase
{
    private readonly VanguardDbContext _db;

    public BuildingsController(VanguardDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<ActionResult<List<Building>>> List([FromQuery] BuildingStatus? status, [FromQuery] string? query)
    {
        IQueryable<Building> q = _db.Buildings.AsNoTracking();

        if (status is not null)
            q = q.Where(b => b.Status == status.Value);

        if (!string.IsNullOrWhiteSpace(query))
        {
            var s = query.Trim();
            q = q.Where(b => (b.Name ?? "").Contains(s) || (b.Location ?? "").Contains(s));
        }

        var res = await q.ToListAsync();
        res = res
            .OrderByDescending(b => b.CreatedAt)
            .ToList();

        return res;
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<Building>> Get(Guid id)
    {
        var building = await _db.Buildings
            .AsNoTracking()
            .Include(b => b.Tags)
            .ThenInclude(t => t.Photos)
            .Include(b => b.Tags)
            .ThenInclude(t => t.Comments)
            .FirstOrDefaultAsync(b => b.Id == id);

        if (building is null) return NotFound();
        return building;
    }

    [HttpGet("{id:guid}/report")]
    public async Task<IActionResult> Report(Guid id)
    {
        var building = await _db.Buildings
            .AsNoTracking()
            .Include(b => b.Tags)
            .ThenInclude(t => t.Photos)
            .Include(b => b.Tags)
            .ThenInclude(t => t.Comments)
            .FirstOrDefaultAsync(b => b.Id == id);

        if (building is null) return NotFound();

        var bytes = BuildingReportGenerator.GenerateDocx(building);
        var safeName = string.Join("_", (building.Name ?? "building").Split(Path.GetInvalidFileNameChars(), StringSplitOptions.RemoveEmptyEntries)).Trim();
        if (string.IsNullOrWhiteSpace(safeName)) safeName = "building";
        var fileName = $"{safeName}_report.docx";

        return File(bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileName);
    }

    public sealed record CreateBuildingRequest(string Name, string MainPhotoDataUrl, string? Location);

    [HttpPost]
    public async Task<ActionResult<Building>> Create([FromBody] CreateBuildingRequest req)
    {
        var building = new Building
        {
            Id = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow,
            Name = (req.Name ?? string.Empty).Trim(),
            Location = string.IsNullOrWhiteSpace(req.Location) ? null : req.Location.Trim(),
            Status = BuildingStatus.Active,
            MainPhotoDataUrl = req.MainPhotoDataUrl ?? string.Empty,
        };

        _db.Buildings.Add(building);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = building.Id }, building);
    }

    public sealed record SetBuildingStatusRequest(BuildingStatus Status);

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid id, [FromBody] SetBuildingStatusRequest req)
    {
        var building = await _db.Buildings.FirstOrDefaultAsync(b => b.Id == id);
        if (building is null) return NotFound();

        building.Status = req.Status;
        building.CompletedAt = req.Status == BuildingStatus.Completed ? DateTimeOffset.UtcNow : null;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    public sealed record AddTagRequest(TagType Type, double X, double Y);

    [HttpPost("{id:guid}/tags")]
    public async Task<ActionResult<Tag>> AddTag(Guid id, [FromBody] AddTagRequest req)
    {
        var building = await _db.Buildings
            .Include(b => b.Tags)
            .FirstOrDefaultAsync(b => b.Id == id);
        if (building is null) return NotFound();

        var nextSeq = (building.Tags.Count == 0 ? 0 : building.Tags.Max(t => t.Seq)) + 1;
        var x = Math.Min(1, Math.Max(0, req.X));
        var y = Math.Min(1, Math.Max(0, req.Y));

        var status = req.Type switch
        {
            TagType.Anchor => TagStatus.BeforeCheck,
            TagType.Cleaning => TagStatus.BeforeCleaning,
            TagType.Issue => TagStatus.None,
            _ => TagStatus.None,
        };

        var tag = new Tag
        {
            Id = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow,
            BuildingId = building.Id,
            Seq = nextSeq,
            Type = req.Type,
            Status = status,
            X = x,
            Y = y,
            Photos = [],
            Comments = [],
        };

        _db.Tags.Add(tag);
        await _db.SaveChangesAsync();

        return CreatedAtAction(nameof(Get), new { id = building.Id }, tag);
    }

    public sealed record UpdateTagRequest(
        string? Name,
        TagStatus? Status,
        double? X,
        double? Y,
        List<TagPhoto>? Photos,
        List<TagComment>? Comments
    );

    [HttpPatch("{buildingId:guid}/tags/{tagId:guid}")]
    public async Task<IActionResult> UpdateTag(Guid buildingId, Guid tagId, [FromBody] UpdateTagRequest req)
    {
        var needsCollections = req.Photos is not null || req.Comments is not null;

        var tagQ = _db.Tags.AsQueryable();
        if (needsCollections)
            tagQ = tagQ.Include(t => t.Photos).Include(t => t.Comments);

        var tag = await tagQ.FirstOrDefaultAsync(t => t.Id == tagId && t.BuildingId == buildingId);
        if (tag is null) return NotFound();

        if (req.Name is not null)
            tag.Name = string.IsNullOrWhiteSpace(req.Name) ? null : req.Name.Trim();

        if (req.X is not null) tag.X = Math.Min(1, Math.Max(0, req.X.Value));
        if (req.Y is not null) tag.Y = Math.Min(1, Math.Max(0, req.Y.Value));

        if (req.Status is not null) tag.Status = req.Status.Value;
        if (req.Photos is not null)
        {
            tag.Photos.Clear();
            foreach (var p in req.Photos)
            {
                if (p.Id == Guid.Empty) p.Id = Guid.NewGuid();
                tag.Photos.Add(p);
            }
        }
        if (req.Comments is not null)
        {
            var incoming = req.Comments
                .Select(c =>
                {
                    if (c.Id == Guid.Empty) c.Id = Guid.NewGuid();
                    return c;
                })
                .ToList();

            var incomingIds = incoming.Select(x => x.Id).ToHashSet();
            var byId = tag.Comments.ToDictionary(x => x.Id, x => x);

            foreach (var c in incoming)
            {
                if (byId.TryGetValue(c.Id, out var existing))
                {
                    existing.Text = c.Text ?? string.Empty;
                    existing.CreatedAt = c.CreatedAt;
                }
                else
                {
                    tag.Comments.Add(new TagComment
                    {
                        Id = c.Id,
                        CreatedAt = c.CreatedAt,
                        Text = c.Text ?? string.Empty,
                    });
                }
            }

            tag.Comments.RemoveAll(x => !incomingIds.Contains(x.Id));
        }

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict();
        }
        return NoContent();
    }

    [HttpDelete("{buildingId:guid}/tags/{tagId:guid}")]
    public async Task<IActionResult> DeleteTag(Guid buildingId, Guid tagId)
    {
        var tag = await _db.Tags.FirstOrDefaultAsync(t => t.Id == tagId && t.BuildingId == buildingId);
        if (tag is null) return NotFound();
        _db.Tags.Remove(tag);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{buildingId:guid}/tags/{tagId:guid}/files")]
    [RequestSizeLimit(50_000_000)]
    public async Task<ActionResult<TagPhoto>> UploadFile(
        Guid buildingId,
        Guid tagId,
        [FromForm] IFormFile file,
        [FromForm] TagPhotoKind kind = TagPhotoKind.General
    )
    {
        if (file is null || file.Length == 0) return BadRequest();

        var tag = await _db.Tags.Include(t => t.Photos).FirstOrDefaultAsync(t => t.Id == tagId && t.BuildingId == buildingId);
        if (tag is null) return NotFound();

        var photo = new TagPhoto
        {
            Id = Guid.NewGuid(),
            CreatedAt = DateTimeOffset.UtcNow,
            Kind = kind,
            FileName = file.FileName ?? string.Empty,
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
        };

        using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms);
            photo.Blob = ms.ToArray();
        }

        tag.Photos.Add(photo);

        try
        {
            await _db.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            var exists = await _db.Tags.AsNoTracking().AnyAsync(t => t.Id == tagId && t.BuildingId == buildingId);
            return exists ? Conflict() : NotFound();
        }

        return CreatedAtAction(nameof(DownloadFile), new { buildingId, tagId, fileId = photo.Id }, photo);
    }

    [HttpGet("{buildingId:guid}/tags/{tagId:guid}/files/{fileId:guid}")]
    public async Task<IActionResult> DownloadFile(Guid buildingId, Guid tagId, Guid fileId)
    {
        var tag = await _db.Tags.AsNoTracking().Include(t => t.Photos).FirstOrDefaultAsync(t => t.Id == tagId && t.BuildingId == buildingId);
        if (tag is null) return NotFound();

        var photo = tag.Photos.FirstOrDefault(p => p.Id == fileId);

        if (photo is null) return NotFound();
        return File(photo.Blob, photo.ContentType, photo.FileName);
    }
}

